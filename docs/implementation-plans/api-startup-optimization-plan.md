# API Startup Optimization Plan

**Date:** 2026-02-19 (revised)
**Sources:** Combined audit by Claude Opus 4.6 + Codex GPT 5.2, peer-reviewed by GPT
**Current state:** `dotnet build` ~19-21s, `dotnet run` ~19-21s, `MainApi.exe` (direct) ~789ms

---

## 1. Diagnosis

### The key insight

The actual API host boots in **~789ms**. The perceived ~20s "startup time" is
almost entirely **build pipeline and CLI orchestration overhead**, not the
application itself. This was confirmed by both audits independently.

| Measurement                                    | Time     |
|------------------------------------------------|----------|
| `MainApi.exe` (direct executable)              | ~789ms   |
| `dotnet MainApi.dll` (runtime host)            | ~942ms   |
| `dotnet run --no-build` (CLI orchestration)    | ~17s     |
| `dotnet build` (full Debug build)              | ~19-21s  |
| `dotnet run` (build + host)                    | ~19-21s  |

### Build time breakdown

Measured with `dotnet build -c Debug --no-incremental -clp:PerformanceSummary`:

| Phase                        | Time     | Notes                                      |
|------------------------------|----------|--------------------------------------------|
| NuGet restore evaluation     | ~10-12s  | Runs even when all packages are up-to-date |
| Roslyn compilation (Csc)     | ~5s      | 211 files / 26,153 LOC — reasonable        |
| BuildTranslationKeyGenerator | ~1.4-2s  | Rebuilds separate project every time       |
| GenerateTranslationKeys      | ~103ms   | Fast once the tool DLL exists              |
| OpenAPI doc generation       | ~2-3s    | Boots entire app to extract endpoint spec  |
| MSBuild overhead             | ~3-4s    | Target evaluation, sub-builds              |

### Runtime startup cost (within the ~789ms host boot)

All initialization is synchronous. Ordered by estimated cost:

| Component                      | File                     | Lines     | Est. Cost | Introduced       |
|--------------------------------|--------------------------|-----------|-----------|------------------|
| `ValidateOnBuild = true`       | ServiceRegistration.cs   | 174-177   | Largest   | Nov 23 (`a5fd12e6`) |
| `ServiceScanner.ScanAssembly`  | ServiceScanner.cs        | 36-82     | Medium    | Feb 4 (`67bc410e`)  |
| `ServiceValidator.Validate`    | ServiceValidator.cs      | 28-58     | Medium    | Feb 4 (`67bc410e`)  |
| `AppEnvironment.Initialize`    | AppEnvironment.cs        | 146-195   | Low       | Feb 5 (`57b02644`)  |
| `OnModelCreating` (DbContext)  | MainApiDbContext.cs      | 155-342   | Low       | Nov 1 (`869b44fd`)  |
| Seeder discovery (`GetTypes`)  | MainApiDbContext.cs      | 138-153   | Low       | Nov 1 (`869b44fd`)  |

**Note:** Seeder discovery is `Lazy<T>` and seeding (`Database.Migrate`/`EnsureCreated`)
only runs in test fixtures — it is NOT on the production/dev startup critical path.

### What already helps

The `make dev-api` target already applies two optimizations:

```makefile
dev-api:
    cd $(API_DIR) && dotnet watch run --no-restore -property:OpenApiGenerateDocuments=false
```

These save ~12-15s compared to a raw `dotnet run`. The remaining ~17s from
`dotnet run --no-build` is CLI orchestration overhead that `dotnet watch` also pays.

### Git history: how we got here

| Date       | Commit     | What changed                                                      | Impact on startup |
|------------|------------|-------------------------------------------------------------------|-------------------|
| 2025-09-05 | `4f354e39` | Build-time OpenAPI gen + translation key gen introduced           | +5s build         |
| 2025-11-01 | `869b44fd` | Reflection-driven seeder architecture, DbSet=10, constraints=8   | +minor runtime    |
| 2025-11-11 | `68676845` | TranslationKeyGen changed to build sub-project before generating  | +1.4s build       |
| 2025-11-23 | `a5fd12e6` | `ValidateOnBuild = true` introduced                               | +runtime cost     |
| 2025-12-29 | `a8863ed1` | .NET 10 upgrade, OpenAPI gen temporarily disabled                 | Temporary relief  |
| 2025-12-30 | `5da62292` | OpenAPI gen re-enabled                                            | +2-3s build       |
| 2026-02-04 | `67bc410e` | ServiceScanner + ServiceValidator + `[Service]` attribute system  | +runtime cost     |
| 2026-02-05 | `57b02644` | `AppEnvironment.Initialize()` with fail-fast env validation       | +minor runtime    |
| Feb 13-17  | (various)  | 69 files added (specs + AuditLogs), total .cs files: 142 → 211   | Scales scan costs |

### DbContext complexity growth

| Snapshot        | DbSets | Check Constraints | Indexes |
|-----------------|--------|-------------------|---------|
| Nov 2025        | 10     | 8                 | 3       |
| Jan 2026        | 14     | 14                | 5       |
| Now (Feb 2026)  | 13     | 15                | 5       |

Growth is incremental and not a primary driver, but it compounds with
`OnModelCreating` running during OpenAPI build-time app execution.

---

## 2. Design Decisions

### Fail-fast DI validation is kept

`ValidateOnBuild = true` and `ServiceValidator.Validate()` remain on the startup
path. Both serve distinct roles:

- **`ValidateOnBuild`**: catches missing DI registrations, captive dependencies,
  and scope mismatches at startup rather than at first request
- **`ServiceValidator`**: catches project-specific rules (namespace, interface
  naming, key format, duplicates) that the framework validator cannot

Since there is no CI pipeline, fail-fast at startup is the primary safety net.
The ~789ms host boot time is acceptable and does not justify weakening these
guarantees.

### OpenAPI generation stays on by default for `dotnet build`

Multiple pipeline paths depend on `apps/api/openapi/MainApi.json` being fresh:

| Consumer                          | When                   | If spec missing          |
|-----------------------------------|------------------------|--------------------------|
| `make generate-client`            | Manual                 | **Fails** (stale client) |
| `pnpm kiota:generate`            | Manual                 | **Fails**                |
| Vite `generateClient()` plugin   | `pnpm dev` / `pnpm build` | Skips (graceful)     |
| Vite file watcher                 | Auto on spec change    | No trigger               |
| `make client-info`               | Diagnostic             | **Fails**                |
| Docker build                      | Deploy                 | Disabled (OK)            |

Making OpenAPI off-by-default risks stale spec drift. Since there is no CI to
enforce regeneration, the safe choice is:
- **`dotnet build`**: OpenAPI ON (ensures spec is always fresh)
- **`make dev-api`**: OpenAPI OFF (already the case, for speed)
- **Docker build**: OpenAPI OFF (already the case)

This means `dotnet build` keeps the ~2-3s OpenAPI cost, but `make dev-api`
(the primary dev loop) is unaffected.

### Assembly.GetTypes() cache is not worth the coupling

Two `Assembly.GetTypes()` calls exist (ServiceScanner + seeder discovery), but:
- Seeder discovery is `Lazy<T>` and not on the startup path
- The proposed cache accepts `Assembly` but stores a single static — incorrect
  if ever called with different assemblies
- Measurable gain is near zero

Dropped from the plan.

---

## 3. Implementation Plan

Only **safe, high-confidence** changes are included. Each step is independent
and can be applied and measured incrementally.

### Step 1 — Convert TranslationKeyGenerator to a .NET 10 file-based app

**Effort:** Low | **Expected savings:** ~1.4-2s per build (eliminates sub-project build entirely)

Currently, every API build runs two pre-build targets:
1. `BuildTranslationKeyGenerator` — builds `packages/_tx-key-gen/TranslationKeyGenerator.csproj` (~1.4-2s)
2. `GenerateTranslationKeys` — runs the compiled DLL (~103ms)

The generator is a perfect candidate for .NET 10's
[file-based apps](https://learn.microsoft.com/en-us/dotnet/core/sdk/file-based-apps):
- Single `Program.cs` file with top-level statements
- Zero NuGet dependencies (only `System.Text` + `System.Text.Json`, built into the SDK)
- Simple CLI tool pattern

With file-based apps, there is **no project to build** — the SDK compiles and
caches the `.cs` file on the fly. This eliminates the `BuildTranslationKeyGenerator`
target entirely, along with the staleness risk that the previous `Inputs`/`Outputs`
approach (v1 of this plan) had to work around.

The script moves from `packages/_tx-key-gen/` into `apps/api/scripts/` since it
produces API source code and logically belongs with the API project. The entire
`packages/_tx-key-gen/` directory is deleted.

**Why this is better than `Inputs`/`Outputs` on the project build:**

| Concern                        | `Inputs`/`Outputs` (v1) | File-based app (v2)          |
|--------------------------------|-------------------------|------------------------------|
| Stale DLL from source changes  | Must track all `.cs` files as inputs | No DLL — nothing to go stale |
| Sub-project build cost         | ~1.4s when inputs change, 0s when skipped | No sub-project at all |
| Staleness correctness          | Risk if new source files aren't tracked | Impossible — no build artifact |
| MSBuild target complexity      | 2 targets, 5+ properties | 1 target, 2 properties       |
| `clean-tx-gen` Makefile target | Still needed             | Can be removed               |

#### 1a. Move and convert the generator script

Move `packages/_tx-key-gen/Program.cs` to `apps/api/scripts/generate-translation-keys.cs`
and add `#:property` directives at the top.

The repo root `Directory.Build.props` sets `TreatWarningsAsErrors=true`,
`EnforceCodeStyleInBuild=true`, and `WarningsAsErrors=IDE0130`. The current
`.csproj` overrides some of these. For the file-based app, `#:property`
directives serve the same purpose.

All inherited warning/style policies must be explicitly cleared to prevent
build failures from inherited settings (GPT review: confirmed `CS1587` failure
without these overrides).

**New file:** `apps/api/scripts/generate-translation-keys.cs`

```csharp
#:property EnforceCodeStyleInBuild=false
#:property GenerateDocumentationFile=false
#:property TreatWarningsAsErrors=false
#:property WarningsAsErrors=

using System.Text;
using System.Text.Json;

// ... rest of content copied from packages/_tx-key-gen/Program.cs unchanged ...
```

#### 1b. Delete the old `_tx-key-gen` package and update the solution file

**Directory:** `packages/_tx-key-gen/` — **delete the entire directory**
(contains `TranslationKeyGenerator.csproj` and `Program.cs`).

**File:** `PublyApp.slnx` — remove the project reference and its folder.

Current (lines 12-15):
```xml
<Folder Name="/packages/" />
<Folder Name="/packages/_tx-key-gen/">
    <Project Path="packages/_tx-key-gen/TranslationKeyGenerator.csproj" />
</Folder>
```

Change to:
```xml
<Folder Name="/packages/" />
```

Without this, solution load/build via `PublyApp.slnx` will break because the
referenced `.csproj` no longer exists.

#### 1c. Exclude `scripts/` from API compilation and rewrite MSBuild targets

The `.cs` file inside `apps/api/scripts/` would be auto-included by the
`Microsoft.NET.Sdk.Web` SDK as API source code. It must be excluded from
compilation. The `--file` flag on `dotnet run` is required because
`MainApi.csproj` exists in the working directory (without it, `dotnet run`
would pass the filename as an argument to the API project).

`Inputs`/`Outputs` is still used to skip the target entirely when the JSON
input and generator source haven't changed.

**File:** `apps/api/MainApi.csproj`

Add to the existing `<Compile Remove>` `ItemGroup` (lines 8-18):
```xml
<Compile Remove="scripts/**" />
```

Replace current translation-key properties and targets:

Current:
```xml
<PropertyGroup>
    <GeneratedDir>Generated</GeneratedDir>
    <TranslationJsonFile>$(MSBuildProjectDirectory)\..\..\packages\shared\lib\i18n\json\response-message.en.json</TranslationJsonFile>
    <GeneratedKeysFile>$(MSBuildProjectDirectory)\$(GeneratedDir)\ResponseKeys.g.cs</GeneratedKeysFile>
    <TranslationKeyGenProject>$(MSBuildProjectDirectory)\..\..\packages\_tx-key-gen\TranslationKeyGenerator.csproj</TranslationKeyGenProject>
    <TranslationKeyGenOutputDir>$(MSBuildProjectDirectory)\..\..\packages\_tx-key-gen\bin\$(Configuration)\net10.0</TranslationKeyGenOutputDir>
    <TranslationKeyGenDll>$(TranslationKeyGenOutputDir)\TranslationKeyGenerator.dll</TranslationKeyGenDll>
</PropertyGroup>

<Target Name="BuildTranslationKeyGenerator" BeforeTargets="GenerateTranslationKeys" Condition="'$(Configuration)' != 'Test'">
    <Message Text="Building TranslationKeyGenerator..." Importance="normal" />
    <Exec Command="dotnet build &quot;$(TranslationKeyGenProject)&quot; -c $(Configuration)" ContinueOnError="false" />
</Target>

<Target Name="GenerateTranslationKeys" BeforeTargets="BeforeBuild" DependsOnTargets="BuildTranslationKeyGenerator" Condition="'$(Configuration)' != 'Test'">
    <Message Text="Generating translation keys from response-message.en.json..." Importance="high" />
    <Exec Command="dotnet &quot;$(TranslationKeyGenDll)&quot; &quot;$(TranslationJsonFile)&quot; &quot;$(GeneratedKeysFile)&quot;" ContinueOnError="false" />
</Target>
```

Replace with:
```xml
<PropertyGroup>
    <GeneratedDir>Generated</GeneratedDir>
    <TranslationJsonFile>$(MSBuildProjectDirectory)\..\..\packages\shared\lib\i18n\json\response-message.en.json</TranslationJsonFile>
    <GeneratedKeysFile>$(MSBuildProjectDirectory)\$(GeneratedDir)\ResponseKeys.g.cs</GeneratedKeysFile>
    <TranslationKeyGenScript>$(MSBuildProjectDirectory)\scripts\generate-translation-keys.cs</TranslationKeyGenScript>
</PropertyGroup>

<Target Name="GenerateTranslationKeys"
        BeforeTargets="BeforeBuild"
        Condition="'$(Configuration)' != 'Test'"
        Inputs="$(TranslationJsonFile);$(TranslationKeyGenScript)"
        Outputs="$(GeneratedKeysFile)">
    <Message Text="Generating translation keys from response-message.en.json..."
             Importance="high" />
    <Exec Command="dotnet run --file &quot;$(TranslationKeyGenScript)&quot; -- &quot;$(TranslationJsonFile)&quot; &quot;$(GeneratedKeysFile)&quot;"
          ContinueOnError="false" />
</Target>
```

**How it works:**
- `dotnet run --file` compiles `generate-translation-keys.cs` on first
  invocation and caches the result. Subsequent runs with the same source
  content reuse the cache.
- `Inputs`/`Outputs` makes MSBuild skip the target entirely when
  `ResponseKeys.g.cs` is newer than both the JSON input and the script.
- If the script source changes, both `Inputs` (tracks the `.cs` file) and
  the .NET SDK cache (tracks file content) pick up the change. No stale
  output is possible.
- The `BuildTranslationKeyGenerator` target is gone — no sub-project build.
- The path is now local to the API project (`scripts/generate-translation-keys.cs`),
  so the property uses a simple relative path instead of `..\..\packages\...`.

**What the `Inputs`/`Outputs` track:**

| Input                                  | Triggers re-run when...                |
|----------------------------------------|----------------------------------------|
| `response-message.en.json`             | Translation keys are added/changed     |
| `generate-translation-keys.cs`         | Generator logic changes                |

| Output                                 | Existence means...                     |
|----------------------------------------|----------------------------------------|
| `ResponseKeys.g.cs`                    | Generated file is up-to-date           |

**Incremental skip caveat:** The generator intentionally skips writing
`ResponseKeys.g.cs` when its content is unchanged (line 83-90 of the script).
This means if the script timestamp changes but produces identical output, the
output file's timestamp stays old and MSBuild will re-run the target on the
next build. This is a minor inefficiency (~100-200ms for a cached file-based
app run), not a correctness issue — the output is always correct, it's just
that the skip optimization doesn't kick in for that specific case. Touching
the output file unconditionally would fix the skip but risks triggering
unnecessary Roslyn recompilation of the API project (since `ResponseKeys.g.cs`
is a compiled source file). The current behavior is the safer trade-off.

#### 1d. Remove `clean-tx-gen` from Makefile

**File:** `Makefile`

Delete the `clean-tx-gen` target and its help entry — there are no build
artifacts to clean anymore. The .NET SDK manages the file-based app cache
automatically (and `dotnet clean file-based-apps` can clear it if needed).

**Verify:**
```bash
# First build — runs GenerateTranslationKeys (file-based app compiles + caches)
cd apps/api && dotnet build -c Debug -v:normal 2>&1 | grep -iE "translat|skipping"

# Second build (no changes) — MSBuild skips target via Inputs/Outputs
cd apps/api && dotnet build -c Debug -v:normal 2>&1 | grep -iE "translat|skipping"

# Edit response-message.en.json — should re-run (input changed)
# Edit apps/api/scripts/generate-translation-keys.cs — should re-run (input changed)

# Integration tests still pass
make test-api
```

---

### Step 2 — Add `--no-restore` to `build-api` Makefile target

**Effort:** Trivial | **Expected savings:** ~10-12s on `make build-api`

NuGet restore evaluation is the single largest build cost (~10-12s) and runs
even when all packages are up-to-date. The `dev-api` target already uses
`--no-restore`. Apply the same to `build-api` for day-to-day use, and add
a `build-api-full` target for when packages change.

**File:** `Makefile`

Current:
```makefile
build-api:
    @echo "Building API..."
    cd $(API_DIR) && dotnet build
```

Change to:
```makefile
build-api:
    @echo "Building API..."
    cd $(API_DIR) && dotnet build --no-restore

build-api-full:
    @echo "Building API (with restore)..."
    cd $(API_DIR) && dotnet build
```

Also update `run-api` for consistency:
```makefile
run-api:
    @echo "Running API..."
    cd $(API_DIR) && dotnet run --no-restore
```

Update the `help` target to document both:
```makefile
@echo "  build-api   - Build API only (skip restore, faster)"
@echo "  build-api-full - Build API with full NuGet restore"
```

**When to use which:**
- `make build-api` — normal day-to-day builds (fast)
- `make build-api-full` — after adding/removing NuGet packages, or if
  `build-api` fails with missing assembly errors
- `make install` — already runs `dotnet restore` separately

**Verify:**
```bash
# Should complete in ~8-10s instead of ~19-21s
time make build-api
```

---

### Step 3 — Integrate `build-api` into `generate-client`

**Effort:** Trivial | **Expected savings:** None (correctness improvement)

Currently `make generate-client` reads the existing `MainApi.json` without
building the API first. If the spec is stale (e.g. after API changes without
a `dotnet build`), the generated client will be out of sync.

Add a build step with OpenAPI generation to ensure the spec is always fresh
before client generation.

**File:** `Makefile`

Current:
```makefile
generate-client:
    @echo "Generating API client with Kiota..."
    cd $(JS_CLIENT_DIR) && dotnet kiota generate -d ../../$(API_DIR)/openapi/MainApi.json -o src -l typescript -n MainApi.Client -c ApiClient
```

Change to:
```makefile
generate-client:
    @echo "Building API and generating OpenAPI spec..."
    cd $(API_DIR) && dotnet build --no-restore
    @echo "Generating API client with Kiota..."
    cd $(JS_CLIENT_DIR) && dotnet kiota generate -d ../../$(API_DIR)/openapi/MainApi.json -o src -l typescript -n MainApi.Client -c ApiClient
```

This ensures the OpenAPI spec is regenerated from the latest code before Kiota
reads it. The `--no-restore` flag keeps it fast. OpenAPI generation is still
enabled by default in the `.csproj`, so the build produces a fresh spec.

**Verify:**
```bash
# Make an API change, then run generate-client — spec should reflect the change
make generate-client
```

---

## 4. Verification Sequence

Apply steps incrementally and measure after each:

```bash
# 0. Baseline
cd apps/api && time dotnet build -c Debug --no-incremental

# 1. After Step 1 (incremental TranslationKeyGen)
cd apps/api && time dotnet build -c Debug --no-incremental   # first build, runs targets
cd apps/api && time dotnet build -c Debug                     # second build, skips targets

# 2. After Step 2 (--no-restore on build-api)
time make build-api

# 3. Ensure nothing is broken
make test-api
make generate-client
make tsc-front
```

---

## 5. Expected Results

| Scenario                           | Before   | After     | Savings  |
|------------------------------------|----------|-----------|----------|
| `make build-api` (incremental)     | ~19-21s  | **~8-10s**| ~10-12s  |
| `make build-api` (no-incremental)  | ~19-21s  | ~17-19s   | ~2s      |
| `dotnet build` (raw, with restore) | ~19-21s  | ~17-19s   | ~2s      |
| `make dev-api` (first start)       | ~17s     | ~15-16s   | ~1-2s    |
| `make dev-api` (rebuild on change) | ~varies  | Faster    | Skip TranslationKeyGen |
| `MainApi.exe` (direct)             | ~789ms   | ~789ms    | Unchanged |
| `make generate-client`             | Reads stale spec | Always fresh | Correctness |

### Why we don't save more on raw `dotnet build`

NuGet restore evaluation (~10-12s) and Roslyn compilation (~5s) are inherent
.NET SDK costs. Without `--no-restore`, the floor is ~15s. The `make build-api`
target gets around this with `--no-restore`, bringing it to ~8-10s.

The primary developer loop (`make dev-api`) was already optimized and remains
the fastest path.

---

## 6. What we intentionally keep (and why)

| Component                          | Why keep it                                                        |
|------------------------------------|--------------------------------------------------------------------|
| `ValidateOnBuild = true`           | Fail-fast DI validation is a project invariant; no CI to catch later |
| `ValidateScopes = true`            | Near-zero cost, catches captive dependency bugs                    |
| `ServiceValidator` at startup      | Catches `[Service]` attribute misuse before app serves requests    |
| `ServiceScanner` reflection scan   | Only 3 attributed classes; cost is negligible within 789ms boot    |
| `AppEnvironment.Initialize()`      | Fail-fast env validation prevents confusing runtime errors         |
| OpenAPI gen on `dotnet build`      | Ensures spec is always fresh; no CI to enforce regeneration        |

---

## 7. What NOT to optimize (and why)

| Idea                                 | Why skip it                                                    |
|--------------------------------------|----------------------------------------------------------------|
| OpenAPI off by default               | Risk of stale spec drift; no CI to catch it; `dev-api` already skips it |
| Remove `ValidateOnBuild`             | Fail-fast DI is a project requirement                          |
| Move `ServiceValidator` to test only | No CI to run the test; startup fail-fast is the safety net     |
| Cache `Assembly.GetTypes()`          | Seeder scan is not on startup path; cache design is incorrect  |
| Lazy `AppEnvironment.Initialize()`   | Only ~500ms, fail-fast behavior is valuable                    |
| Reduce DbContext `OnModelCreating`   | EF Core caches model after first build; 15 constraints is fine |
| Switch away from `dotnet watch`      | CLI orchestration overhead is a .NET SDK issue, not ours       |

---

## 8. Files to modify

| File                                              | Step | Change                                             |
|---------------------------------------------------|------|----------------------------------------------------|
| `apps/api/scripts/generate-translation-keys.cs`   | 1a   | **New file** — moved from `packages/_tx-key-gen/Program.cs` with `#:property` directives |
| `packages/_tx-key-gen/`                           | 1b   | **Delete entire directory** (`Program.cs` + `TranslationKeyGenerator.csproj`) |
| `PublyApp.slnx`                                   | 1b   | Remove `_tx-key-gen` folder + project reference    |
| `apps/api/MainApi.csproj`                         | 1c   | Add `<Compile Remove="scripts/**" />`; replace 2 targets + 5 properties with 1 target + 2 properties |
| `Makefile`                                        | 1d   | Remove `clean-tx-gen` target + help entry          |
| `Makefile`                                        | 2    | `--no-restore` on `build-api` and `run-api`; add `build-api-full` |
| `Makefile`                                        | 3    | Add `dotnet build` step to `generate-client`       |

**Total: 3 files modified, 1 new file, 1 directory deleted, no runtime code changes.**
