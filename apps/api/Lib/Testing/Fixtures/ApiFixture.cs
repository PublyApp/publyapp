
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.Testing.Fakes;

using Xunit;

namespace PublyApp.Api.Lib.Testing.Fixtures;
/// <summary>
/// Per-test-class fixture that creates its own cloned
/// database from the shared template.
///
/// Each test class gets a fresh DB copy. Tests within the
/// same class share the DB (and may see each other's writes).
///
/// Uses the static PostgresContainerFixture singleton
/// so test classes can run in parallel (no xUnit collection
/// serialization).
/// </summary>
public sealed class ApiFixture : IAsyncLifetime {
	private readonly string _testDbName;
	private readonly string _storageRoot;
	private DatabaseTemplateManager? _dbManager;
	private string _testDbConnectionString = string.Empty;
	private ApiFactory? _factory;
	private HttpClient? _httpClient;
	private readonly List<ApiFactory> _additionalFactories = [];

	public ApiFactory Factory {
		get {
			if (_factory is null) {
				throw new InvalidOperationException("API fixture factory has not been initialized.");
			}

			return _factory;
		}
		private set { _factory = value; }
	}

	/// <summary>
	/// Default shared HttpClient with cookies disabled
	/// to prevent cross-test session leakage.
	/// For tests that need cookie handling, use
	/// CreateClient() with custom options.
	/// </summary>
	public HttpClient HttpClient {
		get {
			if (_httpClient is null) {
				throw new InvalidOperationException("API fixture HTTP client has not been initialized.");
			}

			return _httpClient;
		}
		private set { _httpClient = value; }
	}

	public ApiFixture() {
		_testDbName = $"publyapp_api_test_{Guid.NewGuid():N}";
		_storageRoot = Path.Combine(
			Path.GetTempPath(),
			$"publyapp-api-storage-{Guid.NewGuid():N}"
		);
	}

	/// <summary>
	/// Creates a second, fully independent host against the SAME test
	/// database: a separate <see cref="ApiFactory"/> (WebApplicationFactory)
	/// with its own service provider and Npgsql connection pool, and no
	/// shared in-process state with <see cref="Factory"/>. Specs that pin
	/// the deployed fleet shape — several replicas, one database — use this
	/// alongside <see cref="Factory"/> (#1970).
	/// </summary>
	public ApiFactory CreateSecondHost() {
		var factory = new ApiFactory(
			_testDbConnectionString,
			_storageRoot
		);
		_additionalFactories.Add(factory);
		return factory;
	}

	/// <summary>
	/// Creates a fresh HttpClient (no shared headers,
	/// cookies disabled by default).
	/// </summary>
	public HttpClient CreateClient() {
		return Factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false
			}
		);
	}

	public HttpClient CreateClient(IUploadAdmissionService uploadAdmissionService) {
		var factory = new ApiFactory(
			_testDbConnectionString,
			_storageRoot,
			uploadAdmissionService
		);
		_additionalFactories.Add(factory);
		return factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false
			}
		);
	}

	public async Task InitializeAsync() {
		var container =
			await PostgresContainerFixture.GetSharedAsync();

		_dbManager = new DatabaseTemplateManager(
			container.AdminConnectionString,
			container.TemplateDbName
		);

		_testDbConnectionString =
			await _dbManager.CreateDatabaseFromTemplateAsync(
				_testDbName
			);

		Factory = new ApiFactory(_testDbConnectionString, _storageRoot);

		// Cookies disabled to prevent cross-test session
		// state leakage via cookie jar
		HttpClient = Factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false
			}
		);
	}

	/// <summary>
	/// Retrieves the FakeEmailSender to inspect captured emails.
	/// NOTE: this instance is scoped to the ApiFixture it came from, and emails persist
	/// across every test method sharing that instance. If a test asserts on email state,
	/// do not share this fixture (via IClassFixture) with any other email-observing test
	/// method — give that spec class its own ApiFixture per test method instead (implement
	/// IAsyncLifetime directly and construct a fresh ApiFixture in the class, rather than
	/// taking one through IClassFixture&lt;ApiFixture&gt;). Ownership, not resetting a
	/// shared instance, is what keeps email assertions independent of run order.
	/// </summary>
	public FakeEmailSender GetFakeEmailSender() {
		return Factory.Services
			.GetRequiredService<FakeEmailSender>();
	}

	/// <summary>
	/// Best-effort cleanup: disposes client + factory,
	/// drops the test database. Collects all errors so
	/// one failure doesn't prevent subsequent cleanup.
	/// </summary>
	public async Task DisposeAsync() {
		List<Exception> errors = [];

		try {
			_httpClient?.Dispose();
		} catch (Exception ex) {
			errors.Add(ex);
		}

		if (_factory is not null) {
			try {
				await _factory.DisposeAsync();
			} catch (Exception ex) {
				errors.Add(ex);
			}
		}

		foreach (var factory in _additionalFactories) {
			try {
				await factory.DisposeAsync();
			} catch (Exception ex) {
				errors.Add(ex);
			}
		}

		if (_dbManager is not null) {
			try {
				await _dbManager.DropDatabaseAsync(_testDbName);
			} catch (Exception ex) {
				errors.Add(ex);
			}
		}

		try {
			if (Directory.Exists(_storageRoot)) {
				Directory.Delete(_storageRoot, recursive: true);
			}
		} catch (Exception ex) {
			errors.Add(ex);
		}

		if (errors.Count > 0) {
			throw new AggregateException(
				"Test fixture cleanup failed", errors
			);
		}
	}
}
