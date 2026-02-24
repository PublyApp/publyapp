# API Integration Tests Guide

How to run, write, and debug integration tests for the PublyApp API.

---

## Prerequisites

### 1. Docker

Testcontainers requires a Docker-compatible runtime. Install **one** of:

| Runtime | Platform | Install |
|---------|----------|---------|
| **Docker Desktop** | Windows / macOS | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Docker Engine** | Linux | `sudo apt install docker.io` (or distro equivalent) |
| **Rancher Desktop** | Windows / macOS / Linux | [rancherdesktop.io](https://rancherdesktop.io/) |
| **Podman** | Linux / macOS | [podman.io](https://podman.io/) (needs Testcontainers config) |

**Verify Docker is running:**

```bash
docker info
```

If this fails, start Docker Desktop (or your chosen runtime) and try again.

> **Windows users:** Docker Desktop must be running before you execute tests. WSL2 backend is recommended.

### 2. .NET 10 SDK

The test project targets `net10.0`. Verify:

```bash
dotnet --version
# Should show 10.x.x
```

### 3. No Database Required

You do **not** need a local PostgreSQL install. Testcontainers spins up a fresh Postgres 18 container automatically.

---

## Running the Tests

### Quick Start

```bash
# From the repository root:
make test-api
```

This runs:

```bash
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test
```

### First Run

The first run will be slower because:

1. Docker pulls the `postgres:18-alpine` image (~80MB)
2. The template database is created (migrations + seeding)

Subsequent runs reuse the cached Docker image.

### Expected Output

```
Starting test execution, please wait...
A total of 7 test(s) in 1 test sources...

Passed!  - Failed:     0, Passed:     7, Skipped:     0, Total:     7
```

### Verbose Output

```bash
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test -v normal
```

### Running a Single Test Class

```bash
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~PasswordLoginSpec"
```

### Running a Single Test Method

```bash
cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "ItShouldReturnSessionTokenWithValidCredentials"
```

---

## How It Works

### Architecture

```
xUnit Test Runner
│
├── PostgresContainerFixture (static singleton, once per process)
│   ├── Starts Postgres 18 container via Testcontainers
│   ├── Creates template database (migrations + seeding)
│   ├── Shared across ALL test classes via GetSharedAsync()
│   └── No xUnit collection — test classes run in parallel
│
├── ApiFixture (once per test class)
│   ├── Clones template DB → unique test database
│   ├── Creates MainApiFactory (WebApplicationFactory)
│   ├── Creates HttpClient wired to test server
│   └── Drops test DB on dispose
│
└── Test Classes (run in parallel)
    ├── HealthSpec                → own DB clone
    ├── PasswordLoginSpec         → own DB clone
    └── FindStaffPermissionsSpec  → own DB clone
```

### Key Design Decisions

1. **Real PostgreSQL** (not in-memory) — catches actual DB behavior (uuidv7, JSONB, query filters)
2. **Template DB cloning** — seed once, clone per test class (~20-100ms per clone)
3. **Parallel test classes** — each class gets its own DB clone, no `[Collection]` attribute (which would serialize), up to 4 threads
4. **Real auth flow** — tests use the actual `/auth/login` endpoint with seeded users
5. **Per-request headers** — no shared `DefaultRequestHeaders`, preventing cross-test contamination

### How Environment Configuration Works

Tests need the same environment variables as the real API (database URL, header names, token lengths, etc.). Instead of duplicating all ~17 values, `TestEnvironment.cs` loads `.env.development` as a baseline and overrides only what differs:

```
TestEnvironment.InitializeOnce(postgresConnectionString)
│
├─ 1. Set ASPNETCORE_ENVIRONMENT=Testing
│     (prevents AppEnvironment from loading .env.development again)
│
├─ 2. Load .env.development via DotNetEnv
│     (provides APP_NAME, headers, token lengths, email settings, etc.)
│
├─ 3. Override 5 vars that differ from development:
│     ├─ POSTGRES_CONNECTION_STRING → Testcontainer connection
│     ├─ FRONT_URL → http://localhost (no port)
│     ├─ RESEND_API_KEY → "test" (fake)
│     ├─ STAFF_OWNER_EMAIL → owner@example.com
│     └─ STAFF_OWNER_BOOTSTRAP_CODE → test-bootstrap-code
│
└─ 4. Call AppEnvironment.Initialize()
      (validates all vars, creates the singleton)
```

This means `.env.development` is the single source of truth for shared config. If you add a new required env var to `AppEnvironment`, just add it to `.env.development` — tests will pick it up automatically.

### Seeded Test Data

Tests use data from the EF Core seeders. The seed values have a two-layer structure:

```
SeedConstants (Src/Data/Seeding/SeedConstants.cs)
│  Single source of truth for ALL seed data
│  Used by production seeders at runtime
│
└─► TestConstants (Src/Lib/Testing/Fixtures/TestConstants.cs)
    Convenience facade for test code
    Delegates to SeedConstants (const = compile-time resolution)
    Also defines test-only headers (X-Session-Token, X-PublyApp-TenantId)
```

Key credentials:

| User | Email | Password | Scope |
|------|-------|----------|-------|
| Staff Admin | `staff-admin@example.com` | `ChangeMe123!@3#lol` | Staff |
| Staff User | `staff-user@example.com` | `ChangeMe123!@3#lol` | Staff |
| Acme Admin | `admin-acme@example.com` | `ChangeMe123!@3#lol` | Tenant |
| Acme User | `user-acme@example.com` | `ChangeMe123!@3#lol` | Tenant |

If you need to change seed data, update `SeedConstants.cs` — seeders and `TestConstants` both reference it.

### DI Overrides (MainApiFactory)

`MainApiFactory` extends `WebApplicationFactory<Program>` and overrides two DI registrations:

1. **DbContext connection string** — points to the per-class test database (cloned from template), not the admin/template DB
2. **IEmailSender** — replaced with `FakeEmailSender` (captures sent emails in memory instead of calling Resend API)

Everything else (middleware, auth, routing, services) runs exactly as in production.

### Why FakeEmailSender Lives in Testing/Fakes/

`FakeEmailSender` is in `Src/Lib/Testing/Fakes/` rather than alongside `ResendEmailAdapter` in `Infrastructure/Messaging/Email/` because of how the build system works:

- `MainApi.csproj` **excludes** `Src/Lib/Testing/**/*.cs` from production builds
- The test project **includes** them via `<Compile Include>`
- If `FakeEmailSender` lived in `Infrastructure/`, it would compile into the **production binary**

All test doubles follow this pattern: they live in `Src/Lib/Testing/Fakes/` so they're only compiled into the test assembly.

---

## Writing New Tests

### Step-by-Step

1. **Create the test file** next to the handler it tests:

```
apps/api/Src/Modules/<Domain>/Handlers/<Scope>/
├── MyHandler.cs
└── MyHandler.Spec.cs   ← new file
```

2. **Use the correct namespace** (must match folder path — `IDE0130`):

```csharp
namespace MainApi.Src.Modules.<Domain>.Handlers.<Scope>;
```

3. **Follow this template:**

```csharp
namespace MainApi.Src.Modules.MyDomain.Handlers.Staff;

using System.Net;
using FluentAssertions;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using Xunit;

public sealed class MyHandlerSpec
  : IClassFixture<ApiFixture> {
  private readonly HttpClient _http;
  private readonly TestAuthClient _authClient;

  public MyHandlerSpec(ApiFixture fixture) {
    _http = fixture.HttpClient;
    _authClient = new TestAuthClient(_http);
  }

  [Fact]
  public async Task
  ItShouldReturnExpectedResultWhenValid() {
    // 1. Login (if endpoint requires auth)
    var token =
      await _authClient.LoginAsStaffAdminAsync();

    // 2. Build request with per-request headers
    var request = new HttpRequestMessage(
      HttpMethod.Get,
      "/staff/my-endpoint/"
    ).WithSessionToken(token);

    // 3. Send and assert
    using var response =
      await _http.SendAsync(request);
    response.StatusCode.Should().Be(HttpStatusCode.OK);
  }
}
```

> **Do NOT use `[Collection("Database")]`.** Test classes run in parallel
> by default — each gets its own DB clone via `ApiFixture`. Adding an
> xUnit collection would serialize all test classes, defeating the
> parallel design.

### File Naming Convention

- **Spec files:** `*.Spec.cs`
- The `MainApi.csproj` excludes `**/*.Spec.cs` from production builds
- The test project includes them via `Compile Include`

### Test Method Naming (BDD)

Use the `ItShould{Expected}When{Scenario}` format:

- Always start with `ItShould`
- No underscores in method names
- Examples: `ItShouldReturnOkWithValidData`, `ItShouldReturnUnauthorizedWithoutAuth`

### Setting Auth Headers (Per-Request)

Always use `HttpRequestMessage` with extension methods — **never** use `DefaultRequestHeaders`:

```csharp
// Staff endpoint (session token only)
var request = new HttpRequestMessage(HttpMethod.Get, "/staff/users/")
  .WithSessionToken(token);

// Tenant endpoint (session token + tenant ID)
var request = new HttpRequestMessage(HttpMethod.Get, "/users/")
  .WithSessionToken(token)
  .WithTenantId(tenantGuid);
```

### Testing Email Sending

```csharp
[Fact]
public async Task ItShouldSendEmailOnInvite() {
  var emailSender = fixture.GetFakeEmailSender();
  emailSender.Clear(); // Reset captured emails

  // ... trigger endpoint that sends email ...

  emailSender.SentEmails.Should().HaveCount(1);
  emailSender.SentEmails.First().To
    .Should().Be("invited@example.com");
}
```

### Testing Tenant-Scoped Endpoints

```csharp
[Fact]
public async Task ItShouldReturnDataForTenantEndpoint() {
  // Login as a tenant user
  var token = await _authClient.LoginAsync(
    TestConstants.AcmeAdminEmail,
    TestConstants.SeedPassword
  );

  // Include both session token and tenant ID
  var request = new HttpRequestMessage(
    HttpMethod.Get, "/users/"
  )
    .WithSessionToken(token)
    .WithTenantId(acmeTenantId);

  var response = await _http.SendAsync(request);
  response.StatusCode.Should().Be(HttpStatusCode.OK);
}
```

---

## Troubleshooting

### "Cannot connect to the Docker daemon"

Docker is not running. Start Docker Desktop and wait for it to be ready.

### Tests hang on first run

The `postgres:18-alpine` image is being pulled. Check `docker pull postgres:18-alpine` progress.

### "database is being accessed by other users" on cleanup

This usually means pooled connections are lingering. The `DatabaseTemplateManager` already handles this by calling `NpgsqlConnection.ClearAllPools()` and terminating backends. If it persists, ensure `Pooling=false` is set on test DB connection strings.

### "Environment validation failed" at startup

`TestEnvironment.InitializeOnce()` sets required env vars, but if `AppEnvironment.Initialize()` runs before the test fixture, it may pick up your local `.env.development` values. This is normal — the test factory overrides the DbContext connection string regardless.

### Build fails with test code in API project

Ensure `MainApi.csproj` has these exclusions:

```xml
<Compile Remove="**/*.Spec.cs" />
<Compile Remove="Src/Lib/Testing/**/*.cs" />
```

### Tests fail with 401/403 unexpectedly

Check that `SeedConstants.cs` matches the actual seeded data. Both seeders and `TestConstants` reference `SeedConstants` as the single source of truth. If seed data changes, update `SeedConstants.cs`.

### No autocompletion for `[Fact]`, `.Should()`, `FluentAssertions`, etc.

This is expected when editing `*.Spec.cs` files. The test files live physically under `apps/api/Src/` (colocated with handlers), but they are **compiled by the test project** (`Tests/MainApi.Tests.csproj`), not the main API project. The main project explicitly excludes them:

```xml
<!-- MainApi.csproj -->
<Compile Remove="**/*.Spec.cs" />
<Compile Remove="Src/Lib/Testing/**/*.cs" />
```

Your editor sees the file under `MainApi.csproj`'s directory and resolves it against that project, which has no reference to FluentAssertions, xunit, or any test packages. **The build and test runner work correctly** — this is only an editor/IntelliSense issue.

**Workarounds by editor:**

- **Visual Studio / Rider:** Navigate to test files through the `MainApi.Tests` project node in Solution Explorer (the files appear there via `Link`). Opening from the file system tree will use the wrong project context.
- **VS Code (C# Dev Kit):** Open the `.slnx` solution file so both projects are loaded. If the language server still picks the wrong project, check the status bar for a "Select Project" option.

---

## Project Structure

```
apps/api/
├── Src/
│   ├── Data/
│   │   └── Seeding/
│   │       └── SeedConstants.cs              ← Single source of truth for seed data
│   ├── Lib/
│   │   └── Testing/                          ← Test infrastructure (NO test cases here)
│   │       ├── Fixtures/                     ← Test environment setup
│   │       │   ├── ApiFixture.cs             ← Per-class fixture
│   │       │   ├── PostgresContainerFixture.cs ← Starts Postgres container (singleton)
│   │       │   ├── MainApiFactory.cs         ← WebApplicationFactory override
│   │       │   ├── DatabaseTemplateManager.cs ← Template DB create/clone/drop
│   │       │   ├── TestEnvironment.cs        ← Loads .env.development + overrides
│   │       │   └── TestConstants.cs          ← Facade over SeedConstants + headers
│   │       ├── Helpers/                      ← Test utility methods
│   │       │   ├── TestAuthClient.cs         ← Login helper
│   │       │   ├── TenantTestHelper.cs       ← Tenant suspend/reactivate helpers
│   │       │   ├── SystemNoticeTestHelper.cs ← SystemNotice CRUD helpers
│   │       │   └── HttpRequestMessageExtensions.cs ← Header helpers
│   │       └── Fakes/                        ← Test doubles
│   │           └── FakeEmailSender.cs        ← Captures sent emails
│   └── Modules/
│       ├── Auth/Handlers/
│       │   ├── PassWordLogin.cs
│       │   └── PassWordLogin.Spec.cs         ← Colocated spec
│       ├── Permissions/Handlers/Staff/
│       │   ├── FindStaffPermissions.cs
│       │   └── FindStaffPermissions.Spec.cs
│       └── Health/
│           └── Health.Spec.cs
└── Tests/
    ├── MainApi.Tests.csproj       ← Test project
    └── AssemblyInfo.cs                       ← Parallel config
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Run all tests | `make test-api` |
| Run specific class | `dotnet test ... --filter "FullyQualifiedName~ClassName"` |
| Run specific method | `dotnet test ... --filter "MethodName"` |
| Build test project only | `cd apps/api && dotnet build Tests/MainApi.Tests.csproj -c Test` |
| Pull Postgres image | `docker pull postgres:18-alpine` |
