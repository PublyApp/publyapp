
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using Testcontainers.PostgreSql;

namespace PublyApp.Api.Lib.Testing.Fixtures;
/// <summary>
/// Manages a shared Postgres container for the entire test
/// run. Uses static lazy initialization so test classes can
/// run in parallel without a serializing xUnit collection.
///
/// By default the container is disposable and is disposed when
/// the test process exits; Ryuk remains a fallback for abnormal
/// termination. With `PUBLYAPP_TEST_REUSE_DB=1` (local `just`
/// recipes, never CI) a long-lived container is reused instead,
/// so the migrated template database survives between runs;
/// `just test-db-down` removes it.
///
/// Usage: await PostgresContainerFixture.GetSharedAsync()
/// from ApiFixture.InitializeAsync().
/// </summary>
public sealed class PostgresContainerFixture : IAsyncDisposable {
	// Verified from `docker image inspect postgres:18-alpine`:
	// PGDATA=/var/lib/postgresql/18/docker.
	private const string _DataDirectory =
		"/var/lib/postgresql/18/docker";
	private const string _InitDbArgsVariable = "POSTGRES_INITDB_ARGS";
	private const string _InitDbArgs = "--nosync";
	private static readonly TimeSpan _ProcessExitDisposeTimeout =
		TimeSpan.FromSeconds(5);
	private static readonly SemaphoreSlim _InitLock =
		new(1, 1);
	// Throwaway data only: a crash must never cost a disk flush, and the
	// template build is the only phase that writes enough to checkpoint.
	private static readonly string[] _ServerArgs = [
		"-c", "fsync=off",
		"-c", "synchronous_commit=off",
		"-c", "full_page_writes=off",
		"-c", "autovacuum=off",
		"-c", "max_wal_size=2GB",
	];
	private static PostgresContainerFixture? _SharedInstance;

	private PostgreSqlContainer? _ContainerOrNull;
	private int _DisposeStarted;

	public string AdminConnectionString { get; private set; }
		= string.Empty;
	public string TemplateDbName { get; } = "publyapp_api_template";

	/// <summary>
	/// True when the container dies with the test process (CI, or any run that
	/// did not opt into <c>PUBLYAPP_TEST_REUSE_DB</c>). Its databases disappear
	/// with it, so the per-class drop is pure overhead there.
	/// </summary>
	internal static bool IsEphemeral {
		get { return !TestDatabaseReuse.IsEnabled; }
	}

	private PostgresContainerFixture() {
		AppDomain.CurrentDomain.ProcessExit += this._HandleProcessExit;
	}

	private PostgreSqlContainer _Container {
		get {
			if (this._ContainerOrNull is null) {
				throw new InvalidOperationException("Postgres container has not been initialized.");
			}

			return this._ContainerOrNull;
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
		var instance = Volatile.Read(ref PostgresContainerFixture._SharedInstance);
		if (instance is not null) {
			return instance;
		}

		await PostgresContainerFixture._InitLock.WaitAsync();
		try {
			instance = Volatile.Read(ref PostgresContainerFixture._SharedInstance);
			if (instance is not null) {
				return instance;
			}

			var fixture = new PostgresContainerFixture();
			await fixture._InitializeAsync();
			Volatile.Write(ref PostgresContainerFixture._SharedInstance, fixture);
			return fixture;
		} finally {
			PostgresContainerFixture._InitLock.Release();
		}
	}

	private async Task _InitializeAsync() {
		PostgreSqlContainer? disposableContainer = null;
		try {
			if (TestDatabaseReuse.IsEnabled) {
				this.AdminConnectionString =
					await TestDatabaseReuse.StartAsync();
			} else {
				disposableContainer =
					await this._StartDisposableContainerAsync();
			}

			TestEnvironment.InitializeOnce(this.AdminConnectionString);

			var manager = new DatabaseTemplateManager(
				this.AdminConnectionString,
				this.TemplateDbName
			);
			await manager.EnsureTemplateDatabaseAsync();
		} catch {
			// Dispose a throwaway container immediately on init
			// failure rather than relying on Ryuk — keeps repeated
			// local runs clean and avoids stale containers
			// when Ryuk is disabled. A reused container is left
			// alone: the next run retries against it.
			if (disposableContainer is not null) {
				try {
					await disposableContainer.DisposeAsync();
				} catch {
					// best-effort
				}
			}
			throw;
		}
	}

	private async Task<PostgreSqlContainer>
		_StartDisposableContainerAsync() {
		// Use Testcontainers default wait strategy (more
		// robust than UntilPortIsAvailable — waits for
		// pg_isready or equivalent health check)
		var containerBuilder = new PostgreSqlBuilder("postgres:18-alpine")
			.WithDatabase("postgres")
			.WithUsername("postgres")
			.WithPassword("postgres")
			.WithEnvironment(
				PostgresContainerFixture._InitDbArgsVariable,
				PostgresContainerFixture._InitDbArgs
			)
			.WithTmpfsMount(PostgresContainerFixture._DataDirectory)
			.WithCommand(PostgresContainerFixture._ServerArgs);

		if (!AppEnvironment.IsTestVerboseLoggingEnabled) {
			containerBuilder = containerBuilder
				.WithLogger(NullLogger.Instance);
		}

		this._ContainerOrNull = containerBuilder.Build();
		var container = this._Container;

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
		this.AdminConnectionString =
			adminConnBuilder.ConnectionString;

		return container;
	}

	public async ValueTask DisposeAsync() {
		if (Interlocked.Exchange(ref this._DisposeStarted, 1) != 0) {
			return;
		}

		AppDomain.CurrentDomain.ProcessExit -= this._HandleProcessExit;

		var container = Interlocked.Exchange(ref this._ContainerOrNull, null);
		if (container is not null) {
			await container.DisposeAsync();
		}
	}

	private void _HandleProcessExit(object? sender, EventArgs args) {
		try {
			TestDbTimings.Report();

			var disposeTask = this.DisposeAsync().AsTask();
			_ = disposeTask.ContinueWith(
				static task => {
					_ = task.Exception;
				},
				CancellationToken.None,
				TaskContinuationOptions.OnlyOnFaulted
					| TaskContinuationOptions.ExecuteSynchronously,
				TaskScheduler.Default
			);
			disposeTask.Wait(PostgresContainerFixture._ProcessExitDisposeTimeout);
		} catch {
			// Process-exit cleanup is best-effort. Ryuk remains
			// the fallback when deterministic disposal fails.
		}
	}
}
