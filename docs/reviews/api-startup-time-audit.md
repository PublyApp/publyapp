# API Startup Time Audit

**Date:** 2026-02-19
**Branch:** `fix/detail-pages-not-found-view`
**Current measurements:** `dotnet build` ~19-21s, `dotnet run` ~19-21s

---

## Executive Summary

The API startup time has regressed since project inception. The primary regression
was introduced on **Feb 4, 2026** (commit `67bc410e`) with the DI refactoring that
added `ServiceScanner`, `ServiceValidator`, and `ValidateOnBuild = true`. This was
compounded by rapid project growth (142 to 211 `.cs` files in two weeks), which
increases the cost of assembly reflection scanning at startup.

Build time is dominated by NuGet restore evaluation (~10-12s) even when packages
are unchanged.

---

## Project Growth Timeline

| Time Point          | Commit     | `.cs` Files | Handlers | Notes                              |
|---------------------|------------|-------------|----------|------------------------------------|
| Jan 14, 2026        | (initial)  | ~80         | 29       | Initial entities, seeders, handlers |
| 3 months ago (Nov)  | `1526f6b5` | 118         | ~35      | Steady growth                      |
| 2 months ago (Dec)  | `ae617a6a` | 127         | ~38      |                                    |
| 1 month ago (Jan)   | `21b38789` | 139         | ~41      |                                    |
| **Feb 4** (DI refactor) | `67bc410e` | ~142    | 41       | **ServiceScanner + ValidateOnBuild introduced** |
| Feb 5               | `e9ce3f1e` | 142         | 41       |                                    |
| Feb 13-14           | (specs)    | ~200        | 66       | +69 files (specs, AuditLogs)       |
| **Now (Feb 19)**    | HEAD       | **211**     | **69**   | 49% growth in 2 weeks              |

### Key regression commit

- **`67bc410e`** (Feb 4, 2026) — "refactor(di): group registrations + add [Service] attribute system"
  - Introduced `ServiceScanner.cs` (assembly-wide reflection)
  - Introduced `ServiceValidator.cs` (6 validation passes with compiled regex)
  - Set `ValidateOnBuild = true` and `ValidateScopes = true` in DI container options
  - Replaced the old manual `AppServices.cs` registration

---

## Build Time Breakdown (~20s)

Measured with `dotnet build -c Debug --no-incremental` and MSBuild performance summary.

| Phase                              | Time     | % of Total | Notes                                        |
|------------------------------------|----------|------------|----------------------------------------------|
| **NuGet restore evaluation**       | ~10-12s  | ~40%       | Runs even when all packages are up-to-date   |
| **Roslyn compilation (Csc)**       | ~5s      | ~19%       | 211 files / 26,153 LOC — reasonable          |
| **Exec tasks (3 calls)**           | ~5.2s    | ~19%       | TranslationKeyGen build + run + OpenAPI gen  |
| **MSBuild overhead**               | ~3-4s    | ~14%       | Target evaluation, sub-builds                |

### Exec task breakdown

| Task                         | Time   | Runs on every build? |
|------------------------------|--------|----------------------|
| BuildTranslationKeyGenerator | ~2s    | Yes                  |
| GenerateTranslationKeys      | <1s    | Yes                  |
| GenerateOpenApiDocuments     | ~2-3s  | Yes (boots entire app) |

### Build variants comparison

| Configuration                                  | Time    |
|------------------------------------------------|---------|
| Full Debug build (all steps)                   | ~30-37s |
| Debug, no OpenAPI (`-p:OpenApiGenerateDocuments=false`) | ~21-29s |
| Test config (no OpenAPI, no TranslationKeyGen) | ~25-26s |
| Test config, `--no-restore`                    | **~14s** |
| Incremental build (no changes)                 | ~29-32s |

The `--no-restore` variant shows that restore evaluation alone adds ~12s.

---

## Runtime Startup Breakdown (~20s)

All initialization is **synchronous and blocking**. No parallel initialization or
batching is used.

### Startup sequence (`Program.cs`)

```
Line 18: AppEnvironment.Initialize()     → env validation, filesystem walk
Line 20: WebApplication.CreateBuilder()  → framework setup
Line 22: ConfigureLogger()               → Serilog with 3+ file sinks
Line 23: AddWebServices()                → ProblemDetails, OpenAPI, CORS
Line 24: AddInfraServices()              → DbContext config (OnModelCreating)
Line 25: AddAppServices()                → Full DI scanning + validation
Line 27: builder.Build()                 → ValidateOnBuild validates entire DI tree
```

### Cost by component

| Component                        | File                       | Lines     | Est. Cost | Introduced |
|----------------------------------|----------------------------|-----------|-----------|------------|
| `ValidateOnBuild = true`         | ServiceRegistration.cs     | 176       | ~3-5s     | **Feb 4**  |
| `ServiceScanner.ScanAssembly()`  | ServiceScanner.cs          | 41        | ~1-2s     | **Feb 4**  |
| `ServiceValidator.Validate()`    | ServiceValidator.cs        | 28-58     | ~0.5-1s   | **Feb 4**  |
| `AppEnvironment.Initialize()`    | AppEnvironment.cs          | 146-195   | ~0.5-1s   | Jan 14     |
| `OnModelCreating()`              | MainApiDbContext.cs        | 155-342   | ~0.5-1s   | Jan 14     |
| Seeder discovery (`GetTypes()`)  | MainApiDbContext.cs        | 138-153   | ~0.5s     | Jan 14     |
| DI explicit registrations        | ServiceRegistration.cs     | 150-164   | ~0.2s     | Jan 14     |
| Logger config (Serilog)          | LoggerConfigExtensions.cs  | 8-102     | ~0.1s     | Jan 14     |

### Detailed component analysis

#### 1. DI Container Validation (`ValidateOnBuild`) — HIGH IMPACT

**File:** `apps/api/Src/Lib/ServiceRegistration.cs:174-177`

```csharp
options.ValidateScopes = true;
options.ValidateOnBuild = true;
```

Forces the .NET DI container to resolve and validate every registered service at
`builder.Build()`. Cost scales linearly with service count. With 30+ services
(12 explicit + 6 `[Service]` + framework services), this is the single largest
runtime bottleneck.

#### 2. Assembly Reflection Scan #1 (`ServiceScanner`) — MEDIUM IMPACT

**File:** `apps/api/Src/Lib/DI/ServiceScanner.cs:41`

```csharp
types = assembly.GetTypes();
```

Full reflection scan of the entire API assembly (211+ types) to find classes with
`[Service]` attribute. Runs once at startup, not cached across restarts.

#### 3. Service Validation (6 passes) — MEDIUM IMPACT

**File:** `apps/api/Src/Lib/DI/ServiceValidator.cs:28-58`

Runs 6 sequential validation rules on every discovered service:
1. Concrete class check (IsClass, IsAbstract, etc.)
2. Namespace validation against `AllowedNamespacePattern` (compiled regex)
3. Primary interface resolution (`type.GetInterfaces()`)
4. Key format validation against `KeyPattern` (compiled regex)
5. Duplicate unkeyed implementation check
6. Duplicate key-per-type check

#### 4. AppEnvironment Validation — LOW-MEDIUM IMPACT

**File:** `apps/api/Src/Lib/AppEnvironment.cs:146-195`

- `FindDotEnvPath()` (line 299-310): Recursive directory walk to find `.env.development`
- `AppEnvironmentValidator` (line 184): FluentValidation of 19+ env vars including:
  - `BeValidPostgresConnectionString()`: Instantiates `NpgsqlConnectionStringBuilder`
  - `BeValidUrl()`: Creates `Uri` objects
  - `BeValidHeaderName()`: LINQ `.All()` on every character

#### 5. DbContext OnModelCreating — LOW-MEDIUM IMPACT

**File:** `apps/api/Src/Data/DbContext/MainApiDbContext.cs:155-342`

- 15+ check constraints configured via fluent API (lines 162-228)
- 5 partial indexes (lines 263-289)
- Dynamic query filter generation via reflection (lines 300-342):
  - Iterates `modelBuilder.Model.GetEntityTypes()`
  - Builds `Expression.Lambda` for tenant filtering per entity
- Model is cached by EF Core after first creation, but first startup pays full cost

#### 6. Seeder Discovery — Assembly Scan #2 — LOW IMPACT

**File:** `apps/api/Src/Data/DbContext/MainApiDbContext.cs:138-153`

Second `Assembly.GetTypes()` call (separate from ServiceScanner). Results cached in
`Lazy<T>` (`SeederTypeCache`), but first access pays the reflection cost.

---

## OpenAPI Build-Time App Execution

**File:** `apps/api/MainApi.csproj:44-55`

The `Microsoft.Extensions.ApiDescription.Server` package runs `dotnet-getdocument`
during build. This **executes the entire application** to discover endpoints and
generate the OpenAPI spec. Every bottleneck in the runtime startup path also
affects build time.

This means:
- `AppEnvironment.Initialize()` runs during build (needs `.env.development`)
- `ServiceScanner` reflection runs during build
- `ServiceValidator` runs during build
- `ValidateOnBuild` runs during build
- DbContext configuration runs during build

The OpenAPI generation effectively **doubles** the cost of startup-path code.

---

## Proposed Optimizations

### Build Time Optimizations

#### 1. Use `--no-restore` in dev workflow (saves ~10s)

**Effort:** Trivial | **Impact:** HIGH

NuGet restore evaluation is the single largest cost. In development, packages
rarely change between builds.

```makefile
# Makefile
dev-api:
    cd apps/api && dotnet watch run --no-restore
```

#### 2. Make TranslationKeyGenerator incremental (saves ~2s)

**Effort:** Low | **Impact:** MEDIUM

Add MSBuild `Inputs`/`Outputs` to skip the target when the input JSON hasn't changed:

```xml
<!-- MainApi.csproj -->
<Target Name="GenerateTranslationKeys"
        BeforeTargets="BeforeBuild"
        DependsOnTargets="BuildTranslationKeyGenerator"
        Inputs="$(SharedI18nDir)response-message.en.json"
        Outputs="$(GeneratedDir)ResponseKeys.g.cs"
        Condition="'$(Configuration)' != 'Test'">
```

MSBuild will compare timestamps and skip the entire target (including the
sub-project build) when the output is already up-to-date.

#### 3. Make OpenAPI generation on-demand only (saves ~2-3s)

**Effort:** Low | **Impact:** MEDIUM

OpenAPI spec only needs regeneration when endpoints or DTOs change. Move it
behind a flag:

```xml
<!-- MainApi.csproj -->
<OpenApiGenerateDocuments
    Condition="'$(GenerateOpenApi)' == 'true'">true</OpenApiGenerateDocuments>
```

```makefile
# Makefile - only generate when explicitly requested
generate-client:
    cd apps/api && dotnet build -p:GenerateOpenApi=true
    # ... rest of client generation
```

### Runtime Startup Optimizations

#### 4. Disable `ValidateOnBuild` (saves ~3-5s)

**Effort:** Trivial | **Impact:** HIGH

`ValidateOnBuild` is redundant with the custom `ServiceValidator`. Remove it
entirely or limit to CI:

```csharp
// ServiceRegistration.cs
options.ValidateScopes = builder.Environment.IsDevelopment();
options.ValidateOnBuild = false; // ServiceValidator handles custom validation
```

If you want to keep framework-level DI validation, run it only in CI via an
environment variable:

```csharp
options.ValidateOnBuild =
    Environment.GetEnvironmentVariable("VALIDATE_DI_ON_BUILD") == "true";
```

#### 5. Cache `Assembly.GetTypes()` across consumers (saves ~1-2s)

**Effort:** Low | **Impact:** MEDIUM

Two separate `Assembly.GetTypes()` calls scan the same assembly. Share a single
cached result:

```csharp
// ServiceScanner.cs
private static Type[]? s_cachedTypes;

internal static Type[] GetAssemblyTypes(Assembly assembly)
{
    return s_cachedTypes ??= assembly.GetTypes();
}
```

Use `ServiceScanner.GetAssemblyTypes()` in both the scanner and
`MainApiDbContext.DiscoverSeedersInternal()`.

#### 6. Move ServiceValidator to a test (saves ~0.5-1s)

**Effort:** Low | **Impact:** LOW-MEDIUM

The 6-pass validation is a correctness check, not a runtime requirement. Move it
to an integration test that runs in CI:

```csharp
// Tests: ServiceRegistrationSpec.cs
[Fact]
public void ItShouldPassAllServiceValidationRules()
{
    var assembly = typeof(Program).Assembly;
    var services = ServiceScanner.ScanAssembly(assembly);
    var errors = ServiceValidator.Validate(services);
    errors.Should().BeEmpty();
}
```

Then remove `ValidateServiceAttributes()` from the startup path.

#### 7. Lazy AppEnvironment validation (saves ~0.5s)

**Effort:** Medium | **Impact:** LOW

Defer heavy validation (Npgsql parsing, Uri construction) until first use rather
than blocking startup. Parse env vars eagerly but validate lazily.

---

## Summary of Expected Gains

| Optimization                          | Build    | Runtime  | Effort  |
|---------------------------------------|----------|----------|---------|
| `--no-restore` in dev workflow        | **-10s** | —        | Trivial |
| Incremental TranslationKeyGen         | **-2s**  | —        | Low     |
| OpenAPI generation on-demand          | **-2-3s**| —        | Low     |
| Disable `ValidateOnBuild`             | **-2s*** | **-3-5s**| Trivial |
| Cache `Assembly.GetTypes()`           | —        | **-1-2s**| Low     |
| Move ServiceValidator to test         | **-0.5s*** | **-0.5-1s** | Low |
| Lazy AppEnvironment validation        | —        | **-0.5s**| Medium  |

*\* Build savings from OpenAPI gen no longer running app startup code.*

### Projected results

| Metric          | Current  | After optimizations | Improvement |
|-----------------|----------|---------------------|-------------|
| `dotnet build`  | ~20s     | ~8-10s              | ~50-60%     |
| `dotnet run`    | ~20s     | ~10-14s             | ~30-50%     |

---

## Binary Log

A detailed MSBuild binary log was generated at:

```
apps/api/msbuild.binlog
```

Open with [MSBuild Structured Log Viewer](https://msbuildlog.com/) for an
interactive timeline of every build target and task.
