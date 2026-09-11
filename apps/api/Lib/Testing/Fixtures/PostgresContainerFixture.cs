
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using Testcontainers.PostgreSql;

namespace PublyApp.Api.Lib.Testing.Fixtures;
/// <summary>
/// Manages a shared Postgres container for the entire test
/// run. Uses static lazy initialization so test classes can
/// run in parallel without a serializing xUnit collection.
///
/// The shared container is disposed when the test process
/// exits. Ryuk remains a fallback for abnormal termination.
///
/// Usage: await PostgresContainerFixture.GetSharedAsync()
/// from ApiFixture.InitializeAsync().
/// </summary>
public sealed class PostgresContainerFixture : IAsyncDisposable {
	private static readonly TimeSpan _ProcessExitDisposeTimeout =
		TimeSpan.FromSeconds(5);
	private static readonly SemaphoreSlim _InitLock =
		new(1, 1);
	private static PostgresContainerFixture? _SharedInstance;

	private PostgreSqlContainer? _ContainerOrNull;
	private int _DisposeStarted;

	public string AdminConnectionString { get; private set; }
		= string.Empty;
	public string TemplateDbName { get; } = "publyapp_api_template";

	private PostgresContainerFixture() {
		AppDomain.CurrentDomain.ProcessExit += _HandleProcessExit;
	}

	private PostgreSqlContainer _Container {
		get {
			if (_ContainerOrNull is null) {
				throw new InvalidOperationException("Postgres container has not been initialized.");
			}

			return _ContainerOrNull;
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
		var instance = Volatile.Read(ref _SharedInstance);
		if (instance is not null) {
			return instance;
		}

		await _InitLock.WaitAsync();
		try {
			instance = Volatile.Read(ref _SharedInstance);
			if (instance is not null) {
				return instance;
			}

			var fixture = new PostgresContainerFixture();
			await fixture._InitializeAsync();
			Volatile.Write(ref _SharedInstance, fixture);
			return fixture;
		} finally {
			_InitLock.Release();
		}
	}

	private async Task _InitializeAsync() {
		// Use Testcontainers default wait strategy (more
		// robust than UntilPortIsAvailable — waits for
		// pg_isready or equivalent health check)
		var containerBuilder = new PostgreSqlBuilder("postgres:18-alpine")
			.WithDatabase("postgres")
			.WithUsername("postgres")
			.WithPassword("postgres");

		if (!AppEnvironment.IsTestVerboseLoggingEnabled) {
			containerBuilder = containerBuilder
				.WithLogger(NullLogger.Instance);
		}

		_ContainerOrNull = containerBuilder.Build();
		var container = _Container;

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

	public async ValueTask DisposeAsync() {
		if (Interlocked.Exchange(ref _DisposeStarted, 1) != 0) {
			return;
		}

		AppDomain.CurrentDomain.ProcessExit -= _HandleProcessExit;

		var container = Interlocked.Exchange(ref _ContainerOrNull, null);
		if (container is not null) {
			await container.DisposeAsync();
		}
	}

	private void _HandleProcessExit(object? sender, EventArgs args) {
		try {
			var disposeTask = DisposeAsync().AsTask();
			_ = disposeTask.ContinueWith(
				static task => {
					_ = task.Exception;
				},
				CancellationToken.None,
				TaskContinuationOptions.OnlyOnFaulted
					| TaskContinuationOptions.ExecuteSynchronously,
				TaskScheduler.Default
			);
			disposeTask.Wait(_ProcessExitDisposeTimeout);
		} catch {
			// Process-exit cleanup is best-effort. Ryuk remains
			// the fallback when deterministic disposal fails.
		}
	}
}
