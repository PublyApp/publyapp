# ASP.NET Minimal API Integration Tests (PublyApp `apps/api`) — Implementation Plan

This is a **step-by-step plan** to add **real integration tests** for the Minimal API in `apps/api`.

It's written to be:

- **Beginner-friendly** (follow it yourself)
- **Agent-friendly** (hand it to any AI coding agent and it can implement it)

References / inspiration:

- [Twilio: Test ASP.NET Core Minimal APIs](https://www.twilio.com/en-us/blog/test-aspnetcore-minimal-apis)
- [mdbouk: Reliable Minimal APIs with Integration Tests](https://mdbouk.com/say-hello-to-reliable-minimal-apis-with-integration-tests/)
- [martincostello/dotnet-minimal-api-integration-testing](https://github.com/martincostello/dotnet-minimal-api-integration-testing)
- [codepunkt: Blazing fast Prisma + Postgres tests in Vitest](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/)
- [codepunkt/vitest-environment-prisma-postgres](https://github.com/codepunkt/vitest-environment-prisma-postgres)

> Note: The last two links are JavaScript/Prisma-focused, but the **core idea** (fast tests via a seeded baseline + isolation strategy) is directly applicable.

---

## Goals

- Boot the real Minimal API in-memory via `WebApplicationFactory`
- Use a **real PostgreSQL** (not in-memory) to catch real EF/Postgres behavior
- Keep tests **repeatable** and reasonably fast
- Make it easy to test:
  - **Anonymous endpoints** (e.g. `/health`)
  - **Auth endpoints** (e.g. `/auth/login`)
  - **Staff endpoints** (require `X-Session-Token`)
  - **Tenant endpoints** (require `X-Session-Token` + `X-Tenant-Id`)

---

## Performance from day one (default settings)

This plan targets speed immediately by combining:

1) **Seed once** into a Postgres **template database** (migrations + your EF seeders)
2) **Clone DBs** from that template for isolation (recommended unit: **one DB per test class**)
3) **Run test classes in parallel** (safe because each class has its own DB copy)

This mirrors the *idea* from the Prisma/Vitest article (seed once + isolate cheaply)
([codepunkt](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/)), but adapted to
HTTP integration tests where "wrap each test in a DB transaction" doesn't reliably apply.

### Expected Performance Characteristics

With the template DB cloning strategy:

- **Template DB creation** (once per test run): 1-3 seconds
  - Includes migrations + seeding
- **DB clone** (per test class): 20-100ms
  - Depends on template DB size
- **Parallel test execution**: 2-6 threads recommended
  - Adjust `MaxParallelThreads` based on your machine
- **Full test suite** (assuming 20-50 test classes): 10-30 seconds

Compare to alternatives:
- Migrate/seed per test class: 30-60 seconds for same suite
- Shared DB with Respawn: Faster but more complex isolation

### Parallelization strategy (recommended)

- **Parallelize test classes**, not test methods
  - Each class gets its own cloned DB → safe concurrency
- Keep Vertical Slice ergonomics:
  - One `*.IntegrationTests.cs` file next to each handler (or endpoint group)

### Critical Postgres/Npgsql rule for clone + drop

If you clone/drop databases, pooled connections can keep a DB "busy" and make `DROP DATABASE` flaky.

Do both:

- Add `Pooling=false` to **test DB** connection strings
- Call `NpgsqlConnection.ClearAllPools()` before dropping a database

---

## Important constraints in your codebase (why the plan looks like this)

### 1) `AppEnvironment.LoadEnv()` runs at startup and validates required env vars

In `apps/api/Program.cs`, `AppEnvironment.LoadEnv()` runs before building the app.
So **tests must set these environment variables before the test server starts**:

- `POSTGRES_CONNECTION_STRING`
- `FRONT_URL`
- `RESEND_API_KEY`
- `STAFF_OWNER_EMAIL`
- `STAFF_OWNER_BOOTSTRAP_CODE`

We'll set these in the test fixture.

### 2) You already have baseline seeders (great for tests)

Your EF Core setup already discovers and runs all `IEntitySeeder` implementations.
For example, `UserSeeder` seeds `staff-admin@example.com` and others with a known password `ChangeMe123!@3#lol`.

This lets tests authenticate using the **real `/auth/login` endpoint**, instead of mocking auth.

### 3) "Transaction per test" is tricky in HTTP integration tests

The Vitest/Prisma post shows the classic "wrap each test in a DB transaction and rollback" pattern.
That works when the tested code uses a single DB connection per test.

In ASP.NET HTTP integration tests, each request typically uses its own `DbContext` and connection.
So a single "outer transaction" won't automatically cover all queries.

Therefore, for .NET integration tests the most practical isolation options are:

- **(Recommended here)** Clone a **pre-seeded template database** per test class (fast + strong isolation)
- Or drop/recreate/migrate/seed per test class (simpler, slower)
- Or use "truncate/reset" tools like Respawn (fast, but needs a careful baseline strategy)

---

## Proposed approach (recommended for PublyApp)

### Strategy: PostgreSQL Testcontainer + "Template DB cloning"

1. Start **one Postgres Testcontainer** for the entire test run.
2. Create a **template database** inside it:
   - Apply EF migrations
   - Run EF seeders (via EF Core seeding)
3. For each test class (xUnit fixture scope):
   - Create a fresh database with:
     - `CREATE DATABASE ... TEMPLATE template_db;`
   - Start the API test server wired to that DB
4. Drop the database after the class finishes.

Why this is a good fit:

- Your seeders already create a realistic baseline.
- DB cloning is very fast (often tens of ms) and avoids reseeding repeatedly.
- Each test class gets a clean baseline and doesn't leak state to others.

---

## Step-by-step implementation tasks

## Project layout (default): colocated tests in `apps/api` + `Test` configuration

This plan uses the **"best of both worlds"** approach:

- **Tests live next to handlers** (Vertical Slice friendly)
- **Production builds/publish stay clean** (tests + test NuGets compile only in `Test` config)

Pros:

- Tests can live right next to each handler (matches Vertical Slice mindset)
- No "extra Tests/ project folder" to navigate
 - Release builds don't accidentally ship test code / packages

Cons / caveats:

- Less common in .NET; requires careful `.csproj` conditioning
- You must be disciplined about file naming and configuration, otherwise tests will get compiled into normal builds

At the end, there's an appendix describing the more conventional "separate test project" layout if you
ever want to switch.

---

### Step 0 — (Optional) Inspect Claude branch

If you want to compare with Claude's attempt:

- Checkout branch: `claude/add-api-integration-tests-01JKbgkeMTkewk3NjZ64SCKo`
- Identify:
  - What test framework was chosen (xUnit/NUnit)
  - DB strategy (Testcontainers? local DB?)
  - Whether `Program` was made `partial`
  - Whether the approach can support your required auth/tenant headers

Do **not** merge blindly; prefer implementing this plan cleanly.

---

### Step 1 — Enable "Test" configuration in `MainApi.csproj` (colocated tests)

#### 1.1 Create a dedicated build configuration named `Test`

You don't need to "register" it anywhere; just run tests with:

- `dotnet test apps/api/MainApi.csproj -c Test`

#### 1.2 Adopt a naming convention (critical)

Use a consistent suffix so we can safely include/exclude tests via globbing:

- **Integration tests**: `*.IntegrationTests.cs`

Place test files alongside their handlers, for example:

- `apps/api/Src/Modules/Shared/Auth/Handlers/PasswordLogin.IntegrationTests.cs`
- `apps/api/Src/Modules/Staff/PermissionsAsStaff/Handlers/FindStaffPermissions.IntegrationTests.cs`

#### 1.3 Condition test compilation + packages only for `Test`

In `apps/api/MainApi.csproj`, add:

- `IsTestProject=true` only for `Test`
- `PackageReference`s for test tooling only for `Test`
- Exclude `*.IntegrationTests.cs` from all **non-Test** builds

**Important**: Your project uses Central Package Management (all package versions are in `Directory.Packages.props`).
Add the packages there first, then reference them conditionally in `MainApi.csproj`.

Example pattern:

```xml
<PropertyGroup Condition="'$(Configuration)' == 'Test'">
  <IsTestProject>true</IsTestProject>
</PropertyGroup>

<!-- Exclude test files from non-Test builds -->
<ItemGroup Condition="'$(Configuration)' != 'Test'">
  <Compile Remove="**/*.IntegrationTests.cs" />
</ItemGroup>

<!-- Test-only packages -->
<ItemGroup Condition="'$(Configuration)' == 'Test'">
  <PackageReference Include="Microsoft.NET.Test.Sdk" />
  <PackageReference Include="xunit" />
  <PackageReference Include="xunit.runner.visualstudio" />
  <PackageReference Include="Microsoft.AspNetCore.Mvc.Testing" />
  <PackageReference Include="Testcontainers" />
  <PackageReference Include="Testcontainers.PostgreSql" />
  <PackageReference Include="FluentAssertions" />
</ItemGroup>
```

Notes:

- SDK-style projects already include `**/*.cs` by default. The critical part is the
  `Compile Remove` for non-Test builds so you don't ship tests.
- Keep the suffix consistent (`*.IntegrationTests.cs`) so the glob stays safe.
- No version numbers needed in `MainApi.csproj` since you use Central Package Management

#### 1.4 Parallel tests from day one (recommended)

For performance, **do not disable parallelization**. Instead:

- Keep isolation at **one DB per test class**
- Run **test classes in parallel** with a limited thread count

Add `apps/api/Src/Lib/Testing/AssemblyInfo.cs`:

```csharp
using Xunit;

// Safe parallelism: test classes run concurrently; each class uses its own cloned DB.
// Tune this based on your machine + Docker resources.
// Good starting point: 2–6.
[assembly: CollectionBehavior(MaxParallelThreads = 4)]
```

---

### Step 2 — Make `Program` test-hostable

Minimal APIs with top-level statements should expose `Program` to `WebApplicationFactory`.

Add this at the bottom of `apps/api/Program.cs`:

```csharp
public partial class Program { }
```

This is a common requirement referenced by Minimal API integration testing guides such as:

- [Twilio: Test ASP.NET Core Minimal APIs](https://www.twilio.com/en-us/blog/test-aspnetcore-minimal-apis)
- [martincostello/dotnet-minimal-api-integration-testing](https://github.com/martincostello/dotnet-minimal-api-integration-testing)

---

### Step 3 — Add "test host" infrastructure

Create a folder structure under the API project:

- `apps/api/Src/Lib/Testing/`
  - `AssemblyInfo.cs` (from Step 1.4)
  - `TestEnvironment.cs`
  - `PostgresContainerFixture.cs`
  - `DatabaseCollection.cs`
  - `DatabaseTemplateManager.cs`
  - `ApiFixture.cs`
  - `MainApiFactory.cs`
  - `FakeEmailSender.cs`
  - `TestAuthClient.cs`

#### 3.1 `TestEnvironment.cs` (set required env vars once)

Before any server starts, set env vars required by `AppEnvironment.LoadEnv()`.
Use harmless values for the non-DB ones.

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

internal static class TestEnvironment {
  private static int _isInitialized;

  public static void InitializeOnce(string postgresConnectionString) {
    if (Interlocked.Exchange(ref _isInitialized, 1) == 1) return;

    Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
    Environment.SetEnvironmentVariable("POSTGRES_CONNECTION_STRING", postgresConnectionString);
    Environment.SetEnvironmentVariable("FRONT_URL", "http://localhost");
    Environment.SetEnvironmentVariable("RESEND_API_KEY", "test");
    Environment.SetEnvironmentVariable("STAFF_OWNER_EMAIL", "owner@example.com");
    Environment.SetEnvironmentVariable("STAFF_OWNER_BOOTSTRAP_CODE", "test-bootstrap-code");
  }
}
```

#### 3.2 `DatabaseCollection.cs` (xUnit collection definition)

This tells xUnit to share the Postgres container across all test classes.

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

using Xunit;

/// <summary>
/// xUnit collection for sharing the Postgres container across all test classes.
/// All test classes that use [Collection("Database")] will share the same container.
/// </summary>
[CollectionDefinition("Database")]
public class DatabaseCollection : ICollectionFixture<PostgresContainerFixture> {
  // This class is never instantiated; it's just a marker for xUnit
}
```

#### 3.3 `PostgresContainerFixture.cs` (start one container per run)

This fixture starts one Postgres container for the entire test run and creates the template database.

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

using DotNet.Testcontainers.Builders;
using Testcontainers.PostgreSql;
using Xunit;

/// <summary>
/// Collection-level fixture that starts one Postgres container for the entire test run.
/// Creates the template database with migrations + seeding.
/// </summary>
public sealed class PostgresContainerFixture : IAsyncLifetime {
  private PostgreSqlContainer? _container;
  private static readonly SemaphoreSlim TemplateInitLock = new(1, 1);
  private static bool _isTemplateReady;

  public string AdminConnectionString { get; private set; } = string.Empty;
  public string TemplateDbName { get; } = "mainapi_template";

  public async Task InitializeAsync() {
    // Start Postgres container
    _container = new PostgreSqlBuilder()
      .WithImage("postgres:16-alpine")
      .WithDatabase("postgres")
      .WithUsername("postgres")
      .WithPassword("postgres")
      .WithWaitStrategy(Wait.ForUnixContainer().UntilPortIsAvailable(5432))
      .Build();

    await _container.StartAsync();

    // Build admin connection string (connects to 'postgres' database)
    AdminConnectionString = _container.GetConnectionString();

    // Initialize environment variables once
    TestEnvironment.InitializeOnce(AdminConnectionString);

    // Create template database (only once, thread-safe)
    await TemplateInitLock.WaitAsync();
    try {
      if (!_isTemplateReady) {
        var manager = new DatabaseTemplateManager(AdminConnectionString, TemplateDbName);
        await manager.EnsureTemplateDatabaseAsync();
        _isTemplateReady = true;
      }
    } finally {
      TemplateInitLock.Release();
    }
  }

  public async Task DisposeAsync() {
    if (_container != null) {
      await _container.DisposeAsync();
    }
  }
}
```

#### 3.4 `DatabaseTemplateManager.cs` (create template + clone DBs)

This class handles template DB creation and cloning/dropping test databases.

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;
using Npgsql;

/// <summary>
/// Manages PostgreSQL template database creation and cloning for test isolation.
/// </summary>
internal sealed class DatabaseTemplateManager {
  private readonly string _adminConnectionString;
  private readonly string _templateDbName;

  public DatabaseTemplateManager(string adminConnectionString, string templateDbName) {
    _adminConnectionString = adminConnectionString;
    _templateDbName = templateDbName;
  }

  /// <summary>
  /// Creates the template database and runs EF migrations + seeding.
  /// Should be called once per test run.
  /// </summary>
  public async Task EnsureTemplateDatabaseAsync(CancellationToken ct = default) {
    // Connect to postgres database to create template
    await using var conn = new NpgsqlConnection(_adminConnectionString);
    await conn.OpenAsync(ct);

    // Check if template database already exists
    var checkCmd = new NpgsqlCommand(
      $"SELECT 1 FROM pg_database WHERE datname = '{_templateDbName}'",
      conn
    );
    var exists = await checkCmd.ExecuteScalarAsync(ct) != null;

    if (!exists) {
      // CREATE DATABASE cannot run inside a transaction
      var createCmd = new NpgsqlCommand($"CREATE DATABASE {_templateDbName}", conn);
      await createCmd.ExecuteNonQueryAsync(ct);
    }

    // Connect to template database and run migrations + seeding
    var templateConnString = new NpgsqlConnectionStringBuilder(_adminConnectionString) {
      Database = _templateDbName
    }.ConnectionString;

    var options = new DbContextOptionsBuilder<MainApiDbContext>()
      .UseNpgsql(templateConnString)
      .Options;

    await using var dbContext = new MainApiDbContext(options);

    // Apply migrations (this will also trigger EF Core seeding)
    await dbContext.Database.MigrateAsync(ct);
  }

  /// <summary>
  /// Creates a new database by cloning the template.
  /// Returns the connection string for the new database.
  /// </summary>
  public async Task<string> CreateDatabaseFromTemplateAsync(string dbName, CancellationToken ct = default) {
    await using var conn = new NpgsqlConnection(_adminConnectionString);
    await conn.OpenAsync(ct);

    // CREATE DATABASE cannot run in a transaction
    var createCmd = new NpgsqlCommand(
      $"CREATE DATABASE {dbName} TEMPLATE {_templateDbName}",
      conn
    );
    await createCmd.ExecuteNonQueryAsync(ct);

    // Build connection string for the new database
    // IMPORTANT: Pooling=false to avoid connection pool issues when dropping DB
    var builder = new NpgsqlConnectionStringBuilder(_adminConnectionString) {
      Database = dbName,
      Pooling = false
    };

    return builder.ConnectionString;
  }

  /// <summary>
  /// Drops a test database.
  /// Terminates active connections first to avoid "database is being accessed" errors.
  /// </summary>
  public async Task DropDatabaseAsync(string dbName, CancellationToken ct = default) {
    // Clear all connection pools to avoid holding connections
    NpgsqlConnection.ClearAllPools();

    await using var conn = new NpgsqlConnection(_adminConnectionString);
    await conn.OpenAsync(ct);

    // Terminate all connections to the target database
    var terminateCmd = new NpgsqlCommand(
      $@"SELECT pg_terminate_backend(pg_stat_activity.pid)
         FROM pg_stat_activity
         WHERE pg_stat_activity.datname = '{dbName}'
           AND pid <> pg_backend_pid()",
      conn
    );
    await terminateCmd.ExecuteNonQueryAsync(ct);

    // Drop the database
    var dropCmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS {dbName}", conn);
    await dropCmd.ExecuteNonQueryAsync(ct);
  }
}
```

#### 3.5 `ApiFixture.cs` (per-test-class fixture)

This is the **critical missing piece** - each test class gets its own fixture that creates a cloned database.

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

using Xunit;

/// <summary>
/// Per-test-class fixture that creates its own cloned database.
/// Each test class gets a fresh DB copy from the template.
/// Use with: public class MyTests : IClassFixture&lt;ApiFixture&gt;
/// </summary>
public sealed class ApiFixture : IAsyncLifetime {
  private readonly PostgresContainerFixture _containerFixture;
  private readonly string _testDbName;
  private DatabaseTemplateManager _dbManager = null!;
  private string _testDbConnectionString = string.Empty;

  public MainApiFactory Factory { get; private set; } = null!;
  public HttpClient HttpClient { get; private set; } = null!;

  public ApiFixture(PostgresContainerFixture containerFixture) {
    _containerFixture = containerFixture;
    _testDbName = $"mainapi_test_{Guid.NewGuid():N}";
  }

  public async Task InitializeAsync() {
    _dbManager = new DatabaseTemplateManager(
      _containerFixture.AdminConnectionString,
      _containerFixture.TemplateDbName
    );

    // Clone the template DB for this test class
    _testDbConnectionString = await _dbManager.CreateDatabaseFromTemplateAsync(_testDbName);

    // Create the test server wired to this test DB
    Factory = new MainApiFactory(_testDbConnectionString);
    HttpClient = Factory.CreateClient();
  }

  public async Task DisposeAsync() {
    // Clean up
    HttpClient?.Dispose();
    if (Factory != null) {
      await Factory.DisposeAsync();
    }
    await _dbManager.DropDatabaseAsync(_testDbName);
  }
}
```

#### 3.6 `MainApiFactory.cs` (custom `WebApplicationFactory`)

This factory replaces the DbContext and email service for testing.

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Infrastructure.Messaging.Email;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

/// <summary>
/// Custom WebApplicationFactory that configures the app for integration testing.
/// Replaces DbContext and email service with test versions.
/// </summary>
public sealed class MainApiFactory : WebApplicationFactory<Program> {
  private readonly string _dbConnectionString;

  public MainApiFactory(string dbConnectionString) {
    _dbConnectionString = dbConnectionString;
  }

  protected override void ConfigureWebHost(IWebHostBuilder builder) {
    builder.UseEnvironment("Testing");

    builder.ConfigureServices(services => {
      // 1) Replace DbContext registration to force test connection string

      // Remove existing DbContext registration
      var descriptor = services.SingleOrDefault(
        d => d.ServiceType == typeof(DbContextOptions<MainApiDbContext>)
      );
      if (descriptor != null) {
        services.Remove(descriptor);
      }

      // Re-register with test connection string
      services.AddDbContext<MainApiDbContext>(options => {
        options.UseNpgsql(_dbConnectionString);
        options.EnableSensitiveDataLogging();  // Helpful for debugging tests
      });

      // 2) Replace email service with fake
      var emailDescriptor = services.SingleOrDefault(
        d => d.ServiceType == typeof(IEmailSender)
      );
      if (emailDescriptor != null) {
        services.Remove(emailDescriptor);
      }
      services.AddSingleton<IEmailSender, FakeEmailSender>();
    });
  }
}
```

#### 3.7 `FakeEmailSender.cs` (test email service)

This prevents tests from sending real emails.

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

using MainApi.Src.Infrastructure.Messaging.Email;

/// <summary>
/// Fake email sender for tests. Captures emails instead of sending them.
/// </summary>
internal sealed class FakeEmailSender : IEmailSender {
  public List<EmailRequest> SentEmails { get; } = new();

  public Task<EmailResult> SendAsync(EmailRequest request) {
    SentEmails.Add(request);
    return Task.FromResult(new EmailResult {
      Success = true,
      MessageId = Guid.NewGuid().ToString()
    });
  }
}
```

---

### Step 4 — Add basic helpers for auth + tenant header handling

#### 4.1 `TestAuthClient.cs` (authentication helper)

Complete implementation:

```csharp
namespace MainApi.Src.Lib.Testing;

using System.Net.Http.Json;
using System.Text.Json;

/// <summary>
/// Helper for authenticating test requests.
/// </summary>
internal sealed class TestAuthClient {
  private readonly HttpClient _http;

  public TestAuthClient(HttpClient http) {
    _http = http;
  }

  /// <summary>
  /// Logs in as the seeded staff admin and returns the session token.
  /// Credentials: staff-admin@example.com / ChangeMe123!@3#lol
  /// </summary>
  public async Task<string> LoginAsStaffAdminAsync(CancellationToken ct = default) {
    var loginRequest = new {
      email = "staff-admin@example.com",
      password = "ChangeMe123!@3#lol"
    };

    var response = await _http.PostAsJsonAsync("/auth/login", loginRequest, ct);
    response.EnsureSuccessStatusCode();

    var result = await response.Content.ReadFromJsonAsync<LoginResponse>(ct);
    if (result?.SessionToken == null) {
      throw new InvalidOperationException("Login did not return a session token");
    }

    return result.SessionToken;
  }

  private record LoginResponse(string SessionToken, Guid UserId);
}
```

---

### Step 5 — Implement your first 3 integration tests (minimum "smoke suite")

These tests give you high confidence quickly and serve as examples.

#### 5.1 Health Check Test

Create `apps/api/Src/Modules/Shared/Health/Health.IntegrationTests.cs`:

```csharp
namespace MainApi.Src.Modules.Shared.Health;

using System.Net;
using FluentAssertions;
using MainApi.Src.Lib.Testing;
using Xunit;

/// <summary>
/// Integration tests for the health endpoint.
/// </summary>
[Collection("Database")]
public sealed class HealthIntegrationTests : IClassFixture<ApiFixture> {
  private readonly HttpClient _http;

  public HealthIntegrationTests(ApiFixture fixture) {
    _http = fixture.HttpClient;
  }

  [Fact]
  public async Task GetHealth_ReturnsOk() {
    // Act
    var response = await _http.GetAsync("/health");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);
  }
}
```

#### 5.2 Password Login Test

Create `apps/api/Src/Modules/Shared/Auth/Handlers/PasswordLogin.IntegrationTests.cs`:

```csharp
namespace MainApi.Src.Modules.Shared.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using MainApi.Src.Lib.Testing;
using Xunit;

/// <summary>
/// Integration tests for password login endpoint.
/// Tests authentication flow with seeded users.
/// </summary>
[Collection("Database")]
public sealed class PasswordLoginIntegrationTests : IClassFixture<ApiFixture> {
  private readonly HttpClient _http;

  public PasswordLoginIntegrationTests(ApiFixture fixture) {
    _http = fixture.HttpClient;
  }

  [Fact]
  public async Task Login_WithValidCredentials_ReturnsSessionToken() {
    // Arrange
    var loginRequest = new {
      email = "staff-admin@example.com",
      password = "ChangeMe123!@3#lol"
    };

    // Act
    var response = await _http.PostAsJsonAsync("/auth/login", loginRequest);

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);

    var result = await response.Content.ReadFromJsonAsync<LoginResponse>();
    result.Should().NotBeNull();
    result!.SessionToken.Should().NotBeNullOrEmpty();
    result.UserId.Should().NotBeEmpty();
  }

  [Fact]
  public async Task Login_WithInvalidPassword_ReturnsUnauthorized() {
    // Arrange
    var loginRequest = new {
      email = "staff-admin@example.com",
      password = "wrong-password"
    };

    // Act
    var response = await _http.PostAsJsonAsync("/auth/login", loginRequest);

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
  }

  [Fact]
  public async Task Login_WithNonexistentUser_ReturnsUnauthorized() {
    // Arrange
    var loginRequest = new {
      email = "nonexistent@example.com",
      password = "any-password"
    };

    // Act
    var response = await _http.PostAsJsonAsync("/auth/login", loginRequest);

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
  }

  private record LoginResponse(string SessionToken, Guid UserId);
}
```

#### 5.3 Staff Permissions Test (Auth Header)

Create `apps/api/Src/Modules/Staff/PermissionsAsStaff/Handlers/FindStaffPermissions.IntegrationTests.cs`:

```csharp
namespace MainApi.Src.Modules.Staff.PermissionsAsStaff.Handlers;

using System.Net;
using System.Net.Http.Headers;
using FluentAssertions;
using MainApi.Src.Lib.Testing;
using Xunit;

/// <summary>
/// Integration tests for staff permissions endpoint.
/// Tests authentication header requirement.
/// </summary>
[Collection("Database")]
public sealed class FindStaffPermissionsIntegrationTests : IClassFixture<ApiFixture> {
  private readonly HttpClient _http;
  private readonly TestAuthClient _authClient;

  public FindStaffPermissionsIntegrationTests(ApiFixture fixture) {
    _http = fixture.HttpClient;
    _authClient = new TestAuthClient(_http);
  }

  [Fact]
  public async Task GetPermissions_WithoutToken_ReturnsUnauthorized() {
    // Act
    var response = await _http.GetAsync("/staff/permissions/");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
  }

  [Fact]
  public async Task GetPermissions_WithValidToken_ReturnsOk() {
    // Arrange
    var sessionToken = await _authClient.LoginAsStaffAdminAsync();
    _http.DefaultRequestHeaders.Add("X-Session-Token", sessionToken);

    // Act
    var response = await _http.GetAsync("/staff/permissions/");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);
  }

  [Fact]
  public async Task GetPermissions_WithInvalidToken_ReturnsUnauthorized() {
    // Arrange
    _http.DefaultRequestHeaders.Add("X-Session-Token", "invalid-token");

    // Act
    var response = await _http.GetAsync("/staff/permissions/");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
  }
}
```

---

### Step 6 — Add tenant route tests (headers + tenant scoping)

Example test showing tenant isolation:

```csharp
namespace MainApi.Src.Modules.Tenant.Products.Handlers;

using System.Net;
using FluentAssertions;
using MainApi.Src.Lib.Testing;
using Xunit;

/// <summary>
/// Integration tests for tenant-scoped product endpoints.
/// Tests tenant isolation and header requirements.
/// </summary>
[Collection("Database")]
public sealed class TenantProductsIntegrationTests : IClassFixture<ApiFixture> {
  private readonly HttpClient _http;
  private readonly TestAuthClient _authClient;

  public TenantProductsIntegrationTests(ApiFixture fixture) {
    _http = fixture.HttpClient;
    _authClient = new TestAuthClient(_http);
  }

  [Fact]
  public async Task GetProducts_WithoutTenantId_ReturnsUnauthorized() {
    // Arrange
    var sessionToken = await _authClient.LoginAsStaffAdminAsync();
    _http.DefaultRequestHeaders.Add("X-Session-Token", sessionToken);

    // Act (no X-Tenant-Id header)
    var response = await _http.GetAsync("/tenant/products/");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
  }

  [Fact]
  public async Task GetProducts_WithoutSessionToken_ReturnsUnauthorized() {
    // Arrange
    _http.DefaultRequestHeaders.Add("X-Tenant-Id", Guid.NewGuid().ToString());

    // Act (no X-Session-Token header)
    var response = await _http.GetAsync("/tenant/products/");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
  }

  [Fact]
  public async Task GetProducts_WithBothHeaders_ReturnsOk() {
    // Arrange
    var sessionToken = await _authClient.LoginAsStaffAdminAsync();
    var tenantId = Guid.NewGuid(); // Use actual seeded tenant ID in real test

    _http.DefaultRequestHeaders.Add("X-Session-Token", sessionToken);
    _http.DefaultRequestHeaders.Add("X-Tenant-Id", tenantId.ToString());

    // Act
    var response = await _http.GetAsync("/tenant/products/");

    // Assert
    response.StatusCode.Should().Be(HttpStatusCode.OK);
  }
}
```

---

## Running tests

From repo root:

```bash
dotnet test apps/api/MainApi.csproj -c Test
```

Add to your Makefile:

```makefile
.PHONY: test-api
test-api:
	dotnet test apps/api/MainApi.csproj -c Test
```

Then run:

```bash
make test-api
```

---

## Common pitfalls (and how this plan avoids them)

- **App won't boot in tests**: fixed by setting required env vars before server creation.
- **DbContext uses wrong connection**: fixed by overriding DI registration in `WebApplicationFactory`.
- **Slow tests due to reseeding**: avoided by using a seeded template DB + fast cloning.
- **Accidental external calls (email)**: avoid by swapping out `IEmailSender` with `FakeEmailSender`.
- **DROP DATABASE fails**: fixed by `Pooling=false` and `NpgsqlConnection.ClearAllPools()`.
- **Tests interfere with each other**: fixed by one cloned DB per test class.

---

## Acceptance checklist (definition of done)

- ✅ `dotnet test -c Test` passes locally on a clean machine (only Docker needed)
- ✅ Tests do not depend on local Postgres
- ✅ You can run tests twice in a row with identical results
- ✅ A failing test shows clear HTTP response + payload for debugging
- ✅ Tests run in parallel (2-6 threads)
- ✅ Full test suite completes in under 30 seconds (for ~20-50 test classes)

---

## Appendix A: Alternative Approaches Considered

### IntegreSQL (not recommended for initial setup)

[IntegreSQL](https://github.com/allaboutapps/integresql) is a standalone service that manages PostgreSQL template databases via HTTP API.

**Why we didn't choose it:**
- Adds extra complexity (run IntegreSQL service + Postgres)
- Network overhead (HTTP calls vs direct SQL)
- Less common in .NET (fewer examples)
- Your current plan achieves 90% of the benefits natively

**When it WOULD make sense:**
- Multi-language test suites (Node.js E2E + .NET integration)
- Very large teams with centralized DB pool management
- CI optimization at scale

You can migrate to IntegreSQL later without changing test code much.

---

## Appendix B: Option (conventional) — Separate test project

If you later decide you want the more standard .NET structure, move the testing code into a separate project:

- `apps/api/Tests/MainApi.IntegrationTests.csproj`

This reduces risk of accidentally pulling test dependencies into the API project, at the cost of tests not being
physically next to handlers.

**Migration path:**
1. Create new test project
2. Move all `*.IntegrationTests.cs` files to the new project
3. Move `Src/Lib/Testing/` to the test project
4. Remove test-related config from `MainApi.csproj`
5. Update namespaces if needed

