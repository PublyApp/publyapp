# Plan — adaptive cache solution (#58)

Delivery: this document is the plan. Production code comes per separate task, each reviewable and rejectable alone.

## Ratified owner decisions (2026-08-26, #58 arbitration comment) — applied, not re-discussed

1. `HybridCache` contract, **FusionCache** implementation engine.
2. The `HybridCache` facade is narrower than the native API: fail-safe and soft delays resolve at input-default options, at registration. The exception mechanism is named below (§ Exception mechanism).
3. Fail-safe forbidden by default, allowed by-named-surface, with the statement in the interface.
4. The tenant is carried by the key factory, not by the discipline; seal guard mandatory.
5. Order: instrument first, foundation next, targets one by one with invalidation proof. Redis L2 out of scope.
6. Serializability test: everything entering the cache must survive the distributed L2 pass.

## Verified starting point

No application cache in `apps/api` on `develop`: zero occurrence of `IMemoryCache`, `AddMemoryCache`, `IDistributedCache`, `HybridCache`, `AddOutputCache`. Negative proof: `git grep -c -E "IMemoryCache|AddMemoryCache|IDistributedCache|HybridCache|AddOutputCache" origin/develop -- apps/api` → no match (citations-r1 C1). No Redis in the code nor in the composes. Blank slate confirmed.

## Verified engine choices

- **Version: `ZiggyCreatures.FusionCache` 2.7.1**, latest stable (published 2026-08-20, marked "Latest"; 2.7.0 itself carries the "update to v2.7.1" warning). MIT license.
- **The `AsHybridCache()` adapter exists in this version.** Official documentation (`docs/MicrosoftHybridCache.md`): `services.AddFusionCache().AsHybridCache();` exposes the instance as `HybridCache` in the DI container, while keeping `IFusionCache` resolvable on the same instance. Recent versions even add `RemoveByTag("*")` on the adapter side (2.6.0).
- **The facade enforces startup configuration**, word for word in the docs: "we can configure all of this goodness only at startup, and not on a per-call basis". Each call can only pass a `HybridCacheEntryOptions` auto-mapped to FusionCache options.
- **Additional named caches: `services.AddFusionCache(...).AsKeyedHybridCache("Foo");`** consumed via `[FromKeyedServices("Foo")] HybridCache` (same document, section "I Said Moar!"). This is the exception mechanism retained below.
- Packages added to `Directory.Packages.props`: `ZiggyCreatures.FusionCache` **2.7.1** and `ZiggyCreatures.FusionCache.Serialization.SystemTextJson` **2.7.0**. The serializer lives in a separate package and its latest release is 2.7.0 (NuGet, 2026-08-19); it declares `ZiggyCreatures.FusionCache >= 2.7.0` as a dependency, and the repo's transitive pin keeps the core resolved at 2.7.1 everywhere. Both versions are re-checked on NuGet on 2026-08-26 (citations-r1 C15/C16); a future 2.7.x serializer will be one line of props, nothing else.

## Exception mechanism (point the brief requires closing)

Two candidates existed: named FusionCache configurations, or a dedicated service seeing only `IFusionCache`.

**Retained: named caches exposed as indexed `HybridCache` (`AsKeyedHybridCache`).** Two names only, constants in `apps/api/Lib/Caching/CacheNames.cs`:

```csharp
public static class CacheNames {
    public const string Default = "default";
    public const string StaleTolerant = "stale-tolerant";
}
```

- `CacheNames.Default`: fail-safe **disabled**, single default duration. Injected without key (bare `HybridCache`) wherever the scope passes through the foundation's scope wrappers.
- `CacheNames.StaleTolerant`: fail-safe **enabled by-name** (`AllowFailSafeResponse = true`, `FailSafeMaxDuration` capped at 30 minutes, `FailSafeThrottleDuration` 1 minute). Consumed only via `[FromKeyedServices(CacheNames.StaleTolerant)] HybridCache`, and only by surfaces listed in the `StaleSurfaces` registry (see guard below).

**Rejected — dedicated `IFusionCache` service:** it recreates a second cache abstraction next to the ratified contract (exactly what the "all code against `HybridCache`" decision wanted to avoid), splits key management between two APIs, and puts the per-call expiry decision back into code instead of leaving it at registration options where the owner fixed it. Named options also keep the exit: changing your mind on ONE surface = changing ONE registration line, zero call sites touched.

## Stale expiry visibility (non-negotiable corollary)

A surface that serves stale must say so in the interface. Retained mechanism: **the self-descriptive wrapper**, not engine event subscription.

- `apps/api/Lib/Caching/CachedResult.cs`:

```csharp
public sealed record CachedResult<T>(T Data, DateTimeOffset GeneratedAtUtc);
```

- `CachedResult<T>` is tested by three distinct, refutable specs:
  1. **Serialization round-trip**: `CachedResult<T>` with an arbitrary `T` survives serialize/deserialize via `FusionCacheSystemTextJsonSerializer` (the same serializer as L2) — proving L2 is viable;
  2. **Stale carries a timestamp, fresh does not**: when fail-safe activates, `generated_at_utc` is a past timestamp; a fresh value carries a near-now timestamp;
  3. **`generated_at_utc` is read, not merely written**: a test that creates, serializes, deserializes and verifies the field is consumed — intercepting the silent lie.
- Rule: every surface listed in `StaleSurfaces` stores `CachedResult<T>` and projects `generated_at_utc` into its response DTO under `generated_at_utc` (camelCase JSON). The front displays "data from DD/MM at HH:mm" from this field. Even when the value is fresh the field exists: the UI displays real freshness, and a fail-safe-served stale is immediately visible — impossible to confuse the two.
- Why not FusionCache events (`OnFailSafeActivate`): they don't cross the `HybridCache` facade (no channel to surface "this response came from fail-safe" up to the handler), and would depend on per-key lateral state. The wrapper survives L2 serialization, tests without triggering a failure, and tells the truth even off-failure (normal freshness).
- The log stays the second layer: FusionCache natively traces fail-safe activations in its structured Serilog logs; nothing to write, but the plan requires it in every StaleTolerant surface review (verify the line in the lane's `.dump/` at local proof time).

## Tenant carried by the key factory (ratified decision 4)

### Deterministic factory without reflection — taken from the attachment

The attachment format is preserved and extended to scopes: `nameof(Service)::nameof(Method)` + serialized parameters. Zero `StackFrame`, zero method reflection. `apps/api/Lib/Caching/CacheKeys.cs`:

```csharp
public static class CacheKeys {
    // t/<tenantId>/<service>::<method>/<name>=<value>/...
    public static string ForTenant(Guid tenantId, string service, string method, params (string Name, object? Value)[] args);
    // u/<userId>/<service>::<method>/...
    public static string ForUser(Guid userId, string service, string method, params (string Name, object? Value)[] args);
    // g/<service>::<method>/...
    public static string ForGlobal(string service, string method, params (string Name, object? Value)[] args);
}
```

Format rules, frozen and tested: mandatory scope prefix (`t/`, `u/`, `g/`), `Guid` in lowercase canonical format, values in invariant culture passed through `Uri.EscapeDataString` (so the `/`, `:`, and `=` separators inside a value cannot create a collision), parameter order significant. Same input → same key byte, always.

### Static regeneration from outside — taken from the attachment

Each caching service gets a companion class `apps/api/Modules/<Domain>/Services/<Service>Keys.cs`:

```csharp
public static class PostQueryServiceKeys {
    public static string FindPostsKey(Guid tenantId, string cursor, int size) =>
        CacheKeys.ForTenant(tenantId, nameof(PostQueryService), nameof(PostQueryService.FindPostsAsync),
            ("cursor", cursor), ("size", size));
}
```

The service method uses exactly this static method to compose its key, and any outsider (Quartz job, future staff backoffice) regenerates the same string to invalidate without duplicating logic. Single source: `CacheKeys` + the `*Keys` classes.

## Scopes are wrappers, not discipline

Three wrappers in `apps/api/Lib/Caching/`, registered in `CacheRegistration` (the `[Service]` scanner is reserved for `Modules.*.Services`, these classes live in `Lib` and register manually):

- `TenantScopedCache` (**scoped**): built from `IRequestAuthContext`; its constructor normalizes `IRequestAuthContext.TenantId` (type `string?`) to `Guid` on first use — `Trim()`, then `Guid.TryParse` — and throws an `InvalidOperationException` if the result is `Guid.Empty` or parsing fails. The rejected forms include `null`, `""`, `"   "`, `"00000000-0000-0000-0000-000000000000"` (all representations of `Guid.Empty`), and any string that does not parse as a `Guid`. The stored field is a non-nullable `Guid` — impossible to reach the key path with a shape that produces a shared key. A request with no tenant cannot silently cache in global scope. Exposes only `GetOrCreateAsync<T>(string subKey, ...)`, `GetAsync<T>`, `SetAsync<T>`, `RemoveAsync(string subKey)`, all composed `t/<tenantId>/<subKey>`. Impossible to pass a tenant: there is no parameter for that.
- `UserScopedCache` (scoped, same shape, prefix `u/<userId>/`) for per-user scope (staff permissions).
- `GlobalCache` (singleton, prefix `g/`) for truly shared data.

A business service never sees the `HybridCache` class: wrappers are the only path. Forgetting the tenant becomes structurally impossible — there is no call site where forgetting could happen.

## Guards (fail early, fail loud)

1. **Seal guard** — `apps/api/Lib/Architecture/CacheKeyScopeGuard.Spec.cs`: via `ArchitectureDiscovery.EnumerateApiTypes()` (the reflexive entry point imposed on new architecture guards, `develop:apps/api/Lib/Architecture/ArchitectureDiscovery.cs` symbol `ArchitectureDiscovery`, proof `git show origin/develop:apps/api/Lib/Architecture/ArchitectureDiscovery.cs | sed -n '13p'`, citations-r1 C11):
   - any type under `Modules.*` whose constructor injects `HybridCache` (bare or indexed) is a failure, unless explicitly listed in the spec file's whitelist (initially: no business entries; `Lib/Caching` wrappers and future `StaleSurfaces` surfaces consume the indexed and are traced by the registry);
   - any `[FromKeyedServices(CacheNames.StaleTolerant)]` injection whose declaring type does not appear in `StaleSurfaces.Allowed` is a failure.
   - **Unanalysable input = loud failure**: if the guard encounters a type it cannot classify (e.g. an open generic type parameter), it throws an `InvalidOperationException` naming the type and the reason for the failure. No silent false negative.

   **Known escape surface** (not blocked by the guard, human discipline required):
   - Resolution via `IServiceProvider.GetService` / `IServiceScope.ServiceProvider.GetService` — the guard inspects constructor parameters, not `GetService` calls;
   - Factory / delegate injection (`Func<HybridCache>`, `Func<IIndexProvider, HybridCache>`) — the constructor parameter is the factory, not the cache;
   - Capture in a closure passed to a Quartz job — the captured variable is not a constructor parameter at analysis time;
   - Dynamic resolution / `IServiceProvider.GetService(typeof(HybridCache))` — the effective type is `IServiceProvider`.

   Types outside `Modules.*` (`Lib/`, `Infrastructure/`) are not covered by the guard: their scope is `Lib/` infrastructure that does not serve tenant-scoped business data. Any new use of `HybridCache` in a business domain must go through a scope wrapper.
2. **Stale-allowed surface registry** — `apps/api/Lib/Caching/StaleSurfaces.cs`: static list of entries `(Type DeclaringType, string Justification, DateOnly DecisionDate)`, empty at creation. Each future activation is a line written here, cited in the surface's PR. Guard 1 subjects this registry.
3. **Factory guard** — `CacheKeys` unit specs: reject `Guid.Empty` in tenant/user scope, reject a sub-key starting with a scope prefix (anti-double-prefix), byte-determinism, non-collision on trap values (`"a:b/c=d"`).
4. **Fail-safe guard** — `apps/api/Lib/Caching/CacheEntryOptionsDefaults.cs` exposes two pure functions `CreateDefault()` and `CreateStaleTolerant()` used by registration; their spec pins `AllowFailSafeResponse = false` on the default side and fail-safe caps on the StaleTolerant side. A drift in registration options breaks the spec before breaking the house rule.

## Avalanche protection

Provided by FusionCache (local stampede protection today, distributed the day of the Redis locker). No house rewrite — this is the gap the attachment didn't have and the main reason for the engine choice. Nothing to code; the plan simply forbids it.

## Serializability (ratified decision 6)

- `apps/api/Lib/Caching/CachePayloadTypes.cs`: static list of cached payload types (`IReadOnlyList<Type>`).
- `apps/api/Lib/Caching/CachePayloadSerializationContract.Spec.cs`: for each type in the list, real round-trip via `FusionCacheSystemTextJsonSerializer` (the same serializer as the L2 day) + deep equality (records) + structural rules via reflection: sealed record, public constructor, no interface/abstract-typed member, no `DateTime` (only `DateTimeOffset`), no non-string-key dictionary. Every new cached type MUST be added to the list — each target task below carries this step explicitly, and step 4 of the target template runs this spec.
- Without this test, the "migration without refactor" promise is false: an object living in memory only breaks silently at the Redis pass.

## Global constraints

1. **House conventions**: `PUBLY0001–0008` (no `!`, no `?? throw`, no `ToLower()` dispatch); lines ≤ 100 chars; braces always; co-located `*.Spec.cs` specs named `ItShould{Expected}{Connector}{Scenario}`; namespace = folder path (`IDE0130` as error).
2. **DI registration**: `apps/api/Lib/Caching/CacheRegistration.cs` exposes `AddPublyCache(this IHostApplicationBuilder builder)`; called from `AddAppServices` (`develop:apps/api/Lib/ServiceRegistration.cs` symbol `AddAppServices`, line 211, citations-r1 C8), so available in ALL roles — the worker also calls `AddAppServices` (`develop:apps/api/Program.cs` line 174 in `CreateWorkerHostBuilder`, citations-r1 C9). Quartz jobs can thus invalidate from the first target that needs it.
3. **Versions**: centralized in `Directory.Packages.props` (CMM enabled, `ManagePackageVersionsCentrally` line 4 and `CentralPackageTransitivePinningEnabled` line 7, citations-r1 C4); the csproj references without `Version` attribute (same shape as `<PackageReference Include="Polly" />` line 44, citations-r1 C5).
4. **No new environment variable**: durations and caps are readable constants in `CacheEntryOptionsDefaults`. A `CACHE_*_SECONDS` knob is added only the day a surface demonstrates the need (consistent with the YAGNI triage of #58).
5. **No migration, no OpenAPI contract change** in the foundation. StaleTolerant targets will add `generated_at_utc` to THEIR DTO, which re-runs through `just build-api && just generate-client && pnpm --filter front typecheck`.
6. **Citation honesty**: this plan cites no line number from an in-flight branch. Develop references carry `branch:path` + symbol + `git grep -n`/`git show | sed -n` command, proven in `.dump/citations-r1.md` (14 citations, all PASS at tip `198a6e4b7`).

## File structure (foundation, task 2)

Creations:
- `apps/api/Lib/Caching/CacheNames.cs`
- `apps/api/Lib/Caching/CacheKeys.cs` + `CacheKeys.Spec.cs`
- `apps/api/Lib/Caching/CacheRegistration.cs`
- `apps/api/Lib/Caching/CacheEntryOptionsDefaults.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/StaleSurfaces.cs` + `StaleSurfacesGuard` integrated into point 1
- `apps/api/Lib/Caching/CachedResult.cs`
- `apps/api/Lib/Caching/TenantScopedCache.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/UserScopedCache.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/GlobalCache.cs` + `.Spec.cs`
- `apps/api/Lib/Caching/CachePayloadTypes.cs`
- `apps/api/Lib/Caching/CachePayloadSerializationContract.Spec.cs`
- `apps/api/Lib/Architecture/CacheKeyScopeGuard.Spec.cs`

Modifications:
- `Directory.Packages.props`: two `PackageVersion` (§ Engine choice).
- `apps/api/PublyApp.Api.csproj`: two versionless `PackageReference`.
- `apps/api/Lib/ServiceRegistration.cs`: one `builder.AddPublyCache();` call in `AddAppServices`.
- `.env.example`: **no change** (constraint 4).

---

# Tasks

Each task produces an independently testable deliverable, reviewable and rejectable alone. A task that does not compile alone or whose proof depends on another un-merged task is poorly sized: split it.

## Task 1 — Instrument, then designate 3–5 real targets

**Why first**: caching at random only yields invalidation risks (owner arbitration). No cache code in this task.

**Work:**
1. `apps/api/Program.cs` — in `ConfigureHttpPipeline`, add `app.UseSerilogRequestLogging(...)`: ONE summary line per request (method, path, status, duration in ms via dedicated `MessageTemplate`, session identifier NEVER logged — house anti-secret rule). This is exactly the addition the current code announces as deliberately deferred (`develop:apps/api/Lib/Extensions/LoggerConfigExtensions.cs` lines 80–84: "If per-request visibility is wanted later, add it deliberately as ONE summary line per request (UseSerilogRequestLogging)", citations-r1 C10).
2. `apps/api/Lib/Diagnostics/SlowCommandLogInterceptor.cs` — Serilog `DbCommandInterceptor` that logs any command exceeding 150 ms (`CommandEnd`: SQL text truncated to 500 chars without sensitive parameters, duration). Wired into the `DbContext` configuration (EF interceptors).
3. `apps/api/Lib/Diagnostics/SlowCommandLogInterceptor.Spec.cs` — unit: a fake 200 ms command produces the event with its duration; 20 ms does not; exact 150 ms threshold.

**Measurement proof (deliverable)**: local run `just build-api && just db-migrate && just dev-api`, generated traffic on candidate surfaces (list below), outputs pasted in `.dump/measurements.md`: per surface, call count, p50/p95 of HTTP request durations, slow SQL commands caught by the interceptor. The designation of 3–5 targets (criteria: frequency × measured cost × invalidation clarity) is published as a comment on #58 (`gh issue comment 58 --repo PublyApp/publyapp --body-file .dump/designation.md`) — dated, traceable decision.

**Current candidates (to separate by measurement, not instead of it):**
- Staff permission resolution: `PermissionFilter` calls `IPermissionService.GetPermissionsAsync(userId)` on EVERY non-admin request (`develop:apps/api/Lib/Filters/PermissionFilter.cs` line 53, citations-r1 C2; symbol `GetPermissionsAsync` declared line 12 and implemented line 67 of `develop:apps/api/Modules/Permissions/Services/PermissionService.cs`, citations-r1 C3). User scope (`u/`), invalidation on permission mutations.
- Paginated tenant lists (posts, audit-logs, messaging) depending on what the SQL interceptor measures.
- Social account reads in the publishing worker (the cache is resolvable on the worker side, constraint 2).

**Independence**: the interceptor + request line are reviewable and rejectable alone, without the foundation.

## Task 2 — Foundation (mergeable in separately reviewable sub-PRs)

**2a — Packages and registration.** `Directory.Packages.props` + csproj + `CacheRegistration.cs`:

```csharp
public static IHostApplicationBuilder AddPublyCache(this IHostApplicationBuilder builder) {
    builder.Services.AddFusionCache()
        .WithSerializer(new FusionCacheSystemTextJsonSerializer())
        .WithOptions(o => o.DefaultEntryOptions = CacheEntryOptionsDefaults.CreateDefault())
        .AsHybridCache();

    builder.Services.AddFusionCache(CacheNames.StaleTolerant)
        .WithSerializer(new FusionCacheSystemTextJsonSerializer())
        .WithOptions(o => {
            o.CacheName = CacheNames.StaleTolerant;
            o.DefaultEntryOptions = CacheEntryOptionsDefaults.CreateStaleTolerant();
        })
        .AsKeyedHybridCache(CacheNames.StaleTolerant);

    builder.Services.AddScoped<TenantScopedCache>();
    builder.Services.AddScoped<UserScopedCache>();
    builder.Services.AddSingleton<GlobalCache>();
    return builder;
}
```

(Exact named-registration signature to adjust at compile-time against the 2.7.1 `NamedCaches`/`DependencyInjection` docs — the intent is this, the compiler decides the syntax.) Light integration spec: resolving bare `HybridCache` AND `[FromKeyedServices(CacheNames.StaleTolerant)] HybridCache` from the real ApiFactory graph succeeds; named `IFusionCache` resolves on the same instance as the indexed.

**2b — Key factory + scope wrappers.** Files § Structure. Unit specs: determinism, anti-collision escaping, `Guid.Empty` rejection, anti-double-prefix, runtime-key / static-regenerated-key equality.

**2c — Fail-safe policy.** `CacheEntryOptionsDefaults.CreateDefault()`: `AllowFailSafeResponse = false`, `Duration = 10 minutes`, `SizeLimit = 100_000`. `CreateStaleTolerant()`: `AllowFailSafeResponse = true`, `FailSafeMaxDuration = 30 minutes`, `FailSafeThrottleDuration = 1 minute`. Spec pinning the six values. Behavioral spec on the real DI graph: seeded value then expired via `IFusionCache` + factory that throws → the default PROPAGATES the exception, the StaleTolerant RETURNS the stale (proof that the default-side prohibition truly holds, not just written in options).

**2d — Seal guard + registry.** `CacheKeyScopeGuard.Spec.cs` + `StaleSurfaces.cs` (empty). Proof the guard knows how to fail: temporarily add a fake `Modules` service injecting bare `HybridCache` → spec red → remove → green (transcript in the lane's `.dump/proof-red.md`, md5 before/after).

**2e — Serialization contract.** `CachePayloadTypes` + round-trip spec (empty at start, the spec documents the add procedure and fails if the list contains a non-serializable type).

**2f — Freshness wrapper.** `CachedResult<T>` + its own entry in the serialization contract (itself must survive L2).

**Independence**: 2a–2f are each reviewable alone; 2b/2c/2e/2f have no business consumer yet — their specs suffice.

## Task 3 — Designated targets, one by one (identical template per target, executed in separate PRs)

For each surface S designated by task 1:

1. **Keys**: create `apps/api/Modules/<Domain>/Services/<Service>Keys.cs` (static regeneration) + equality spec with the runtime key. Without this, no step 3.
2. **Read**: rewire the read of S through the correct scope wrapper (`TenantScopedCache`/`UserScopedCache`/`GlobalCache`), TTL chosen from task 1 measurements (never "a good duration" — the duration cited comes from `.dump/measurements.md`). Add the payload type to `CachePayloadTypes` and run the serialization contract.
3. **Invalidation**: at EVERY mutation site touching S's data (found via `git grep -n "<Entity>" -- apps/api/Modules/*/Handlers apps/api/Modules/*/Services`), call `RemoveAsync(<Service>Keys.<MethodKey>(...))`. The site list is in the PR description of S.
4. **Invalidation proof (mandatory, RED first)**: integration spec `ItShouldServeFreshDataAfterMutationWhenCached` — read (miss→factory), mutate via the public API, re-read: fresh data. Prove it tests something: comment out the invalidation call → spec red → restore → green, md5 before/after in `.dump/proof-red.md`. A target without this proof is not merged.
5. **If S is stale-allowed** (registration in `StaleSurfaces` voted in the PR): store as `CachedResult<T>`, project `generated_at_utc` in the DTO, `just build-api && just generate-client && pnpm --filter front typecheck`, display "data from DD/MM at HH:mm" on the `apps/front` side (appropriate state component, i18n EN+FR), and front spec asserting the field's render.

**Expected first target** (if measurement confirms the cost): staff permission resolution — scope `u/`, invalidation from every mutation in the Permissions module, proof by the template above. It serves as the review benchmark for the following ones.

## Out of scope (ratified)

Redis L2, backplane, distributed locker: separate Dokploy deployment decision. Output caching, response caching, front-side cache: other topics. `CACHE_*` environment knobs: deferred until need demonstrated. The foundation is intentionally L1-only: the day of L2, only `CacheRegistration` and the deployment change — the call sites do not move, because the serialization contract was held from day one.

## Riskes and mitigations

| Risk | Mitigation |
|---|---|
| `HybridCache` facade too narrow for a future need | Escape already named: `AsKeyedHybridCache` of other names, or switch ONE surface to `IFusionCache` — one registration line, zero callers touched |
| Drift toward wild fail-safe | Seal guard + `StaleSurfaces` registry + options spec; three independent locks |
| Colliding key | URI escaping of values, non-collision spec, frozen format |
| Non-serializable payload discovered on the L2 day | Serialization contract run on every new payload, same serializer as L2 |
| Multi-node stampede on the L2 day without backplane | Out of scope of the foundation; noted for the deployment decision (FusionCache provides locker + backplane when the time comes) |

## References

- Issue #58: attachment analysis (comment 2026-08-26T11:00:44Z) and owner arbitration (2026-08-26T11:35:00Z).
- Attachment: conversation "I need a Cache solution for my ASP .NET minimal API" — ideas kept: deterministic key factory without reflection (`nameof(Service)::nameof(Method)` + parameters) and static regeneration from outside; discarded idea: the hand-written `IAppCache` abstraction (supplanted by `HybridCache`) and prefix-list invalidation (supplanted by FusionCache tags the day of need).
- Develop citations: `.dump/citations-r1.md` (tip `198a6e4b7`, 16/16 PASS including 2 NuGet verifications added in post-delivery validation).
- FusionCache 2.7.1: GitHub releases (v2.7.1 "Latest", 2026-08-20); `docs/MicrosoftHybridCache.md` (`AsHybridCache`, `AsKeyedHybridCache`, startup-only configuration); MIT license. NuGet pages of both packages (versions re-checked 2026-08-26): [FusionCache 2.7.1](https://www.nuget.org/packages/ZiggyCreatures.FusionCache) and [Serialization.SystemTextJson 2.7.0](https://www.nuget.org/packages/ZiggyCreatures.FusionCache.Serialization.SystemTextJson).
