namespace MainApi.Src.Lib.Testing;

using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

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
	private DatabaseTemplateManager? _dbManager;
	private string _testDbConnectionString = string.Empty;

	public MainApiFactory Factory { get; private set; }
		= null!;

	/// <summary>
	/// Default shared HttpClient with cookies disabled
	/// to prevent cross-test session leakage.
	/// For tests that need cookie handling, use
	/// CreateClient() with custom options.
	/// </summary>
	public HttpClient HttpClient { get; private set; }
		= null!;

	public ApiFixture() {
		_testDbName = $"mainapi_test_{Guid.NewGuid():N}";
	}

	/// <summary>
	/// Creates a fresh HttpClient (no shared headers,
	/// cookies disabled by default).
	/// </summary>
	public HttpClient CreateClient() =>
		Factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false
			}
		);

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

		Factory = new MainApiFactory(_testDbConnectionString);

		// Cookies disabled to prevent cross-test session
		// state leakage via cookie jar
		HttpClient = Factory.CreateClient(
			new WebApplicationFactoryClientOptions {
				HandleCookies = false
			}
		);
	}

	/// <summary>
	/// Retrieves the FakeEmailSender to inspect
	/// captured emails.
	/// NOTE: Emails persist across tests in the same
	/// class. Call GetFakeEmailSender().Clear() at the
	/// start of tests that assert on email state.
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
			HttpClient?.Dispose();
		} catch (Exception ex) {
			errors.Add(ex);
		}

		if (Factory is not null) {
			try {
				await Factory.DisposeAsync();
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

		if (errors.Count > 0) {
			throw new AggregateException(
				"Test fixture cleanup failed", errors
			);
		}
	}
}
