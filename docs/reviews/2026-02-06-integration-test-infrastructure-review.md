# Integration Test Infrastructure Review (PublyApp API)

Date: 2026-02-06  
Reviewer: Senior .NET backend engineer  
Scope: Integration test infrastructure + smoke tests + test build config

## Verdict

**Request Changes**

The overall direction is solid (Testcontainers + template DB cloning + `WebApplicationFactory`), and the suite is fast. However, there are a few **Major** issues that will hurt correctness/isolation as the suite grows, plus a couple of reliability footguns (init/dispose) that can create flaky or hard-to-debug failures.

## Files reviewed

Infrastructure (`apps/api/Src/Lib/Testing/`):
- `TestEnvironment.cs`
- `PostgresContainerFixture.cs`
- `DatabaseTemplateManager.cs`
- `DatabaseCollection.cs`
- `ApiFixture.cs`
- `MainApiFactory.cs`
- `FakeEmailSender.cs`
- `TestAuthClient.cs`
- `TestConstants.cs`
- `HttpRequestMessageExtensions.cs`

Smoke tests:
- `apps/api/Src/Modules/Health/Health.IntegrationTests.cs`
- `apps/api/Src/Modules/Auth/Handlers/PassWordLogin.IntegrationTests.cs`
- `apps/api/Src/Modules/Permissions/Handlers/Staff/FindStaffPermissions.IntegrationTests.cs`

Build config:
- `apps/api/Tests/MainApi.IntegrationTests.csproj`
- `apps/api/MainApi.csproj`
- Central package versions: `Directory.Packages.props`

## Notable strengths

- Template DB cloning via `CREATE DATABASE ... TEMPLATE` is a strong choice for integration test throughput and isolation.
- Keeping `*.IntegrationTests.cs` next to vertical slices + compiling into a dedicated test project is a good compromise (tests live with the slice; production assembly stays clean).
- Using per-request `HttpRequestMessage` for auth headers is the correct direction to avoid cross-test header leakage.
- `FakeEmailSender` as a test double is simple and effective.

---

## 1. Correctness & Reliability

### [Major] `TestEnvironment.InitializeOnce` can leave the process in a partially-initialized state

**Location:** `apps/api/Src/Lib/Testing/TestEnvironment.cs:9`, `apps/api/Src/Lib/Testing/TestEnvironment.cs:94`

`Interlocked.Exchange(ref _isInitialized, 1)` marks the environment initialized before environment variables are fully set and before `AppEnvironment.Initialize()` is called. If anything throws during initialization, the process is stuck in a state where:
- `_isInitialized == 1`
- required env vars may be missing/incorrect
- `AppEnvironment` may not be initialized (or partially initialized)

**Suggested fix (make init transactional / retryable):**

```csharp
public static void InitializeOnce(string postgresConnectionString) {
  if (Interlocked.CompareExchange(ref _isInitialized, 1, 0) != 0) return;

  try {
    // set env vars...
    AppEnvironment.Initialize();
  } catch {
    Volatile.Write(ref _isInitialized, 0);
    throw;
  }
}
```

### [Major] Static template guard is not keyed to the actual container/connection

**Location:** `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs:16-18`, `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs:51-60`

`TemplateInitLock` + `_isTemplateReady` are `static`. If a second fixture instance ever exists in the same process (another test assembly, another xUnit collection pattern, or accidental duplicate setup), `_isTemplateReady` can suppress template creation even though a different container/DB is in use.

**Suggested fix:** make the “template initialized” guard instance-scoped, or key it by `AdminConnectionString` (e.g., `ConcurrentDictionary<string, Lazy<Task>>`).

### [Major] `MigrateAsync()` + `EnsureCreatedAsync()` is a correctness footgun

**Location:** `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs:89-94`

Calling both `Database.MigrateAsync()` and `Database.EnsureCreatedAsync()` is historically discouraged because they represent different database lifecycle approaches (migrations vs create-from-model). Even if EF Core seeding hooks make this appear necessary today, this pairing is fragile:
- Easy to regress (future EF behavior changes, or a new provider behavior)
- Harder to reason about when schema/seeding runs

**Suggested fix:** prefer *one* of these mechanisms. If the goal is seeding, verify whether EF 10’s `MigrateAsync()` already triggers the configured seeding hooks and remove the second call. If not, consider explicit seeding invocation that does not rely on `EnsureCreatedAsync()`.

### [Minor] Container readiness: “port open” isn’t always “DB ready”

**Location:** `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs:30-33`

`UntilPortIsAvailable(5432)` can still race with Postgres finishing startup/accepting auth. Postgres-specific waits (`pg_isready` / log-based) reduce flakiness on slower machines/CI.

### [Major] `ApiFixture.DisposeAsync` is not resilient if initialization fails mid-way

**Location:** `apps/api/Src/Lib/Testing/ApiFixture.cs:66-72`

Issues:
- `_dbManager` is `null!` and will throw if `InitializeAsync()` fails before assignment and Dispose runs.
- Cleanup is not protected: if `Factory.DisposeAsync()` throws, the DB drop won’t run.

**Suggested fix (guard nulls + best-effort cleanup):**

```csharp
public async Task DisposeAsync() {
  List<Exception> errors = [];

  try { HttpClient?.Dispose(); } catch (Exception ex) { errors.Add(ex); }

  if (Factory is not null) {
    try { await Factory.DisposeAsync(); } catch (Exception ex) { errors.Add(ex); }
  }

  if (_dbManager is not null) {
    try { await _dbManager.DropDatabaseAsync(_testDbName); } catch (Exception ex) { errors.Add(ex); }
  }

  if (errors.Count > 0) throw new AggregateException(errors);
}
```

---

## 2. Performance

### [Major] `[Collection("Database")]` serializes all integration test classes

**Location:** `apps/api/Src/Lib/Testing/DatabaseCollection.cs:11-13` and each test class uses `[Collection("Database")]`

In xUnit v2, a collection fixture implies **non-parallel execution for all tests in that collection**. This will become a major bottleneck as test classes scale (50+ / 200+). The template cloning approach *wants* parallel classes; the collection attribute blocks it.

**Suggested fix options:**
- If you stay on xUnit v2: you typically can’t safely share a non-collection fixture across parallel classes; consider moving to xUnit v3 (assembly fixtures) when feasible.
- Or accept serialization for now, but document it explicitly as a conscious trade-off.

### [Minor] `NpgsqlConnection.ClearAllPools()` is process-wide

**Location:** `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs:143`

This clears **all** pools in the process. Today you set `Pooling=false` for test DB connection strings, which reduces the need for this call. In future, if you enable pooling for performance, clearing all pools can cause cross-test/perf issues.

**Suggested fix:** prefer targeted pool clearing (or remove if all test connections are non-pooled and you already terminate backend sessions).

### [Minor] `Pooling=false` everywhere is a trade-off

**Location:** `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs:120-125`

This avoids “drop database” issues, but can slow request-heavy test suites. If tests scale, consider:
- using pooled connections for normal API requests
- using a dedicated non-pooled admin connection string only for create/drop/terminate operations

---

## 3. Security

### [Minor] DB name regex validation is good, but interpolation into SQL literals is still risky as a pattern

**Location:** `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs:18-29`, `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs:54-60`, `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs:150-158`

Validation (`^[a-z0-9_]+$`) is sufficient to prevent injection for identifiers here. However, this pattern can be copy/pasted elsewhere with weaker validation.

**Suggested fix (best practice):** parameterize the string-literal comparisons anyway:

```csharp
using var cmd = new NpgsqlCommand(
  "SELECT 1 FROM pg_database WHERE datname = @name",
  conn
);
cmd.Parameters.AddWithValue("name", _templateDbName);
```

### [Major] Unconditional `EnableSensitiveDataLogging()` can leak secrets to CI logs

**Location:** `apps/api/Src/Lib/Testing/MainApiFactory.cs:56`

Integration tests often run in CI with logs retained. Sensitive logging can reveal request payloads and PII.

**Suggested fix:** gate it behind an explicit env var (default off), or remove it and enable targeted logging only when debugging.

### [Minor] Process-wide environment variables can leak across test assemblies in-process

**Location:** `apps/api/Src/Lib/Testing/TestEnvironment.cs:14+`

This is generally acceptable for a dedicated test process, but it becomes problematic if multiple test assemblies share the same process model. Keep it in mind if you later consolidate tests.

---

## 4. Test Isolation

### [Major] Shared `HttpClient` can leak cookies/session state across tests in the same class

**Location:** `apps/api/Src/Lib/Testing/ApiFixture.cs:25-26`, used by tests like `apps/api/Src/Modules/Auth/Handlers/PassWordLogin.IntegrationTests.cs:12-18`

Even if you avoid mutating `DefaultRequestHeaders`, the default handler can store cookies. If one test logs in and the app uses cookies, subsequent tests may accidentally be authenticated.

**Suggested fix:** disable cookie handling on the shared client:

```csharp
HttpClient = Factory.CreateClient(new WebApplicationFactoryClientOptions {
  HandleCookies = false
});
```

### [Major] `FakeEmailSender` state persists across the whole test class unless cleared

**Location:** `apps/api/Src/Lib/Testing/FakeEmailSender.cs:13-17`, `apps/api/Src/Lib/Testing/FakeEmailSender.cs:33`

Because it’s registered as a singleton in the factory, its bag persists for the fixture lifetime (per test class). If you later add multiple tests that send emails, assertions can become order-dependent unless cleared.

**Suggested fix:** document and enforce `Clear()` per test, or expose helpers like `Drain()` that returns and clears atomically.

### [Minor] DB clone per test class is good, but intra-class DB state can still couple tests

**Location:** `apps/api/Src/Lib/Testing/ApiFixture.cs:11-55`

This is expected, but it should be documented: tests in the same class share DB state unless they explicitly reset it.

---

## 5. Architecture & Design

### [Minor] Fixture layering is clean and understandable

**Location:** `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs`, `apps/api/Src/Lib/Testing/ApiFixture.cs`, `apps/api/Src/Lib/Testing/MainApiFactory.cs`

Collection fixture manages container + template; class fixture clones DB and owns the host/client. This is a good baseline structure.

### [Minor] Co-locating `*.IntegrationTests.cs` with vertical slices is reasonable (with trade-offs)

**Location:** `apps/api/Tests/MainApi.IntegrationTests.csproj:23-28`, `apps/api/MainApi.csproj:9-11`

Trade-offs:
- Pros: tests live with the slice; refactors keep tests nearby.
- Cons: tests live under `Src/` (some devs find this surprising), and correctness depends on maintaining the `Compile Remove` patterns.

### [Minor] Real HTTP login in `TestAuthClient` is correct for integration tests, but consider a faster auth setup for non-auth-focused tests

**Location:** `apps/api/Src/Lib/Testing/TestAuthClient.cs:42-59`

Real login is great for auth tests. For other domains, repeated login calls can add overhead. A test-only “session minting” mechanism (behind `Testing` environment) can be a pragmatic speed tool, as long as auth tests still go through real `/auth/login`.

### [Major] `TestEnvironment` sets `POSTGRES_CONNECTION_STRING` to the admin connection string (DB = `postgres`)

**Location:** `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs:41-47`, `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs:49`

You set `POSTGRES_CONNECTION_STRING` to the admin connection string (likely pointing at the `postgres` database). While `MainApiFactory` correctly overrides `MainApiDbContext` to use the cloned DB, any production code path that uses `AppEnvironment.Instance.POSTGRES_CONNECTION_STRING` directly (outside `MainApiDbContext`) will talk to the wrong database.

**Suggested fix:** enforce “all DB access must go through the DbContext” (preferred), or introduce a test-scoped connection string provider so non-DbContext DB access also points to the cloned DB (hard because env vars are process-wide).

---

## 6. Error Handling & Diagnostics

### [Major] `TestAuthClient` failures are hard to debug

**Location:** `apps/api/Src/Lib/Testing/TestAuthClient.cs:47-55`

`EnsureSuccessStatusCode()` throws without including response body details (ProblemDetails payload, translationKey, etc.).

**Suggested fix:** read and include response body in the exception for quicker diagnosis.

### [Minor] Template/clone/drop should wrap exceptions with operation context

**Location:** `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs`

Recommended: wrap exceptions with “EnsureTemplateDatabaseAsync failed while migrating template DB …” and include DB names and (sanitized) connection host/port.

### [Minor] Container start failures could be more actionable

**Location:** `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs:36`

Consider logging container logs on failure, or surfacing a message like “Docker not running / cannot pull postgres:18-alpine”.

---

## 7. Maintainability & Extensibility

### [Major] `TestConstants` is tightly coupled to seeders and will drift

**Location:** `apps/api/Src/Lib/Testing/TestConstants.cs:8-39`, seeder source of truth: `apps/api/Src/Modules/Users/Seeders/UserSeeder.cs:49-64`

When seed data changes, tests will fail in non-obvious ways (login failing, 400s) without pointing at “seed/test mismatch”.

**Suggested fix options:**
- Create a single “seed contract” module used by both seeding and tests.
- Or query for seeded users by known stable attributes and fail with a clear message if missing.

### [Minor] `TestEnvironment` duplicates header key constants and may drift from `TestConstants`

**Location:** `apps/api/Src/Lib/Testing/TestEnvironment.cs:55-61`, `apps/api/Src/Lib/Testing/TestConstants.cs:36-39`

Both define header names. Ideally `TestEnvironment` uses `TestConstants` (or vice versa) to avoid divergence.

### [Minor] New required `AppEnvironment` variables will fail at runtime

**Location:** `apps/api/Src/Lib/Testing/TestEnvironment.cs`

Consider having `AppEnvironment.Initialize()` throw an exception that prints missing keys, and ensure that failure is visible early (during container/template init).

---

## 8. .NET / xUnit Best Practices

### [Minor] Dispose `HttpResponseMessage` in `TestAuthClient`

**Location:** `apps/api/Src/Lib/Testing/TestAuthClient.cs:42-51`

`HttpResponseMessage` is `IDisposable`. Disposing avoids holding buffers/handlers longer than needed.

**Suggested fix:**

```csharp
using var response = await _http.PostAsJsonAsync(..., ct);
```

### [Minor] Header extension methods should avoid `Headers.Add` throwing on duplicates

**Location:** `apps/api/Src/Lib/Testing/HttpRequestMessageExtensions.cs:12`, `apps/api/Src/Lib/Testing/HttpRequestMessageExtensions.cs:23`

Prefer `TryAddWithoutValidation`, or remove existing values first.

### [Nit] Comments mention “EF Core 9” but versions are EF 10

**Location:** `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs:92`, package versions: `Directory.Packages.props:14`

Update comments to match the actual EF version to prevent confusion.

---

## 9. Missing Test Coverage (highest value next)

### [Major] Tenant header semantics and isolation

Add smoke tests that prove:
- Missing/invalid tenant header yields `400/422` (not `401`) to avoid triggering “logout now” client behavior.
- Tenant A cannot access Tenant B data by swapping `X-PublyApp-TenantId`.

### [Major] Auth semantics: `401` vs `403`

Add tests ensuring:
- Invalid/missing session token => `401`
- Valid session but lacking permission => `403` (and must not trigger frontend logout)

### [Minor] Infrastructure meta-test for DB isolation

Add a simple pair of tests across two classes to assert data written in class A’s clone is not visible in class B’s clone (guards against accidental shared DB use).

---

## 10. Documentation

### [Minor] Add a short “How to write integration tests” guide

Recommend documenting:
- when to use `fixture.HttpClient` vs `fixture.CreateClient()`
- cookie handling expectations
- how to use `TestAuthClient`
- how/when to clear `FakeEmailSender`

### [Minor] Document the coupling of `TestConstants` to seeders

**Location:** `apps/api/Src/Lib/Testing/TestConstants.cs:3-7`

Call out the maintenance expectation explicitly and point to the seeders that define the source of truth.

---

## Summary of required changes before approval

1. Make `TestEnvironment.InitializeOnce` safe against partial initialization.
2. Fix `ApiFixture.DisposeAsync` to be resilient when init fails and to always attempt DB drop.
3. Address shared `HttpClient` isolation (disable cookies by default).
4. Reconsider `MigrateAsync()` + `EnsureCreatedAsync()`; reduce to a single, well-defined schema+seeding mechanism.
5. Remove or gate `EnableSensitiveDataLogging()`.

