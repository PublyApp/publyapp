# .NET and C# features worth adopting — inventory (2026-11-21)

Owner request (21/11/2026): list the .NET / C# language, runtime, ASP.NET Core and EF Core features
from C# 9 / .NET 5 up to C# 15 / .NET 11 that PublyApp could use and does not use yet. Criteria, in
order: **performance**, then less code, then readability. Nothing here may contradict a hard rule
(`AGENTS.md`, `docs/guides/csharp-coding-standards.md`, `.editorconfig`, the `PUBLY*` analyzers,
palier 1).

Baseline: `global.json` SDK 10.0.102, `net10.0`, C# 14, EF Core 10.0.15, Npgsql EF 10.0.3. The
.NET 11 migration and its breaking changes are tracked in issue
[#2325](https://github.com/PublyApp/publyapp/issues/2325); this record does not redo that analysis.

Method: every candidate was checked against the production API code (`apps/api`, excluding specs,
`Lib/Testing`, `Tests`, migrations and generated files: 648 files). Counts below are from that set
on `develop` at `36a77ac15`. "Tests" counts are from the spec/test files.

The codebase is already modern: file-scoped namespaces everywhere, `required` members (651),
collection expressions, raw string literals, `[GeneratedRegex]` (16 files, `SYSLIB1045` enforced),
`Guid.CreateVersion7`, span-based file sniffing with `u8` literals, `System.Threading.Lock`
in 3 of 5 lock sites, EF 9 `UseSeeding`, EF 8 `SqlQuery<T>`, EF 10 block-lambda `ExecuteUpdate`,
`JsonStringEnumConverter<T>`, `FrozenSet`, `TimeProvider` (3 files), `[LoggerMessage]` (1 file),
`Meter`-based job metrics, `IHttpClientFactory`, the ASP.NET rate limiter. The gains left are
mostly on the request hot path (auth filters + EF) and in logging.

## Summary — top 10, ranked

| # | Recommendation | Expected gain | Effort | Needs .NET 11? |
|---|---|---|---|---|
| 1 | **Check the tenant query filter first** (see Concerns): it is built with `Expression.Constant(this.TenantId)` inside `OnModelCreating`, and EF builds the model once per process | correctness; prerequisite for #2 | S to check, S–M to fix | no |
| 2 | DbContext pooling (`AddPooledDbContextFactory` + scoped tenant factory, the documented multi-tenant pattern) | EF docs benchmark: 701 → 350 µs and 50 → 4.6 KB allocated per context; one context per request and per job | M | no |
| 3 | Compiled query + `AsNoTracking` for the per-request auth lookups (session, tenant account, tenant, permissions) | EF docs: 671 → 564 µs, 13 → 9 KB per query; 3–4 such queries run before every tenant handler | S | no |
| 4 | `[LoggerMessage]` source-generated logging instead of `IsEnabled` + `LogX` | removes boxing and template parsing on 175 log calls; deletes 152 hand-written `IsEnabled` guards (~4 lines each) | M (split into ≤600-line PRs) | no |
| 5 | `Convert.ToHexStringLower` (.NET 9) on the rate-limit partition key | one string allocation less on **every** request (`ApiRateLimitPartitionKeys.cs:84`) + 2 other sites | S | no |
| 6 | `Base64Url` (.NET 9) in `CryptoUtils` encrypt/decrypt and Mastodon PKCE | drops 3 `Replace`/`TrimEnd`/padding allocations per call, ~15 lines | S | no |
| 7 | `string.Join(sep, a, b)` via C# 13 `params ReadOnlySpan` instead of `string.Join(sep, new[] { a, b })` | 104 array allocations less (permission definitions), shorter lines | S, mechanical | no |
| 8 | `RandomNumberGenerator.GetString` (.NET 8) for tokens | unbiased tokens (current `% 62` has a modulo bias) for sessions, invitations, resets; ~15 lines deleted | S | no |
| 9 | `CryptographicOperations.FixedTimeEquals` in `PasswordUtils.VerifyPassword` | constant-time hash comparison (today `==`) | S | no |
| 10 | `TimeProvider` + `FakeTimeProvider` everywhere time matters | deterministic tests for expiry, scheduling, backoff; 185 `DateTime.UtcNow` in prod, 316 in tests | L (module by module) | no |

Items 8 and 9 are security fixes more than performance; they are tiny and ranked by cost/benefit.
None of the ten needs .NET 11.

## Language (C# 9 → 14)

| Feature | Version | Used? | Where it applies (count, examples) | Gain | Effort | Risk | Source |
|---|---|---|---|---|---|---|---|
| `params` collections (`params ReadOnlySpan<T>`) | C# 13 / .NET 9 | no | 104 `string.Join(…, new[] { … })`, e.g. `Modules/Invitations/Permissions/InvitationPermissionsForTenant.cs:17`; 117 `new[] {` total | no array alloc; shorter | S | low | https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-13#params-collections |
| `System.Threading.Lock` | C# 13 / .NET 9 | partly (3 files) | 2 `object` locks left: `Infrastructure/Jobs/JobQueueProcessor.cs:1367`, `Lib/RateLimiting/PostgresRateLimitCounterStore.cs:63` | faster uncontended lock; consistency | S | low | https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-13#new-lock-object |
| `field` keyword | C# 14 | no | ~30 required-navigation properties with a hand-written backing field, e.g. `Modules/Publishing/Entities/Publication.cs:17-25` | 1 field declaration less per property | M | medium: EF must still find the generated backing field; verify with a spec | https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-14#the-field-keyword |
| Collection expressions for empty lists | C# 12 | partly (93 sites) | 88 `new List<T>()`, e.g. `Modules/Publishing/Services/PublicationService.cs:595`; `IDE0028`/`IDE0305` are `none` | readability only | S (flip the rules, code-fix) | low | https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-12#collection-expressions |
| Null-conditional assignment `a?.B = x` | C# 14 | no | 1 site found | negligible | — | — | https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-14#null-conditional-assignment |
| Extension members (`extension(T) { }`) | C# 14 | no | 19 classes of classic extension methods | none (same IL) | — | — | https://learn.microsoft.com/dotnet/csharp/whats-new/csharp-14#extension-members |
| Union types | C# 15 / .NET 11 | — | hand-written result unions in services | see [#2325](https://github.com/PublyApp/publyapp/issues/2325) | — | — | (tracked there) |

## Runtime / BCL

| Feature | Version | Used? | Where it applies | Gain | Effort | Risk | Source |
|---|---|---|---|---|---|---|---|
| `Convert.ToHexStringLower` | .NET 9 | 1 site | `Lib/RateLimiting/ApiRateLimitPartitionKeys.cs:84` (every request), `Modules/Publishing/Lib/PublicationIdempotencyKey.cs:17`, `Modules/Publishing/Providers/Fakes/FakeMastodonPublishProvider.cs:100` | 1 alloc less per call | S | low | https://learn.microsoft.com/dotnet/api/system.convert.tohexstringlower |
| `System.Buffers.Text.Base64Url` | .NET 9 | no | `Lib/Utils/CryptoUtils.cs:87-90` and `:113-119` (encrypted tokens/IDs), `Modules/SocialAccounts/Providers/Mastodon/MastodonOAuthService.cs:606` | 3 allocs less per call, ~15 lines | S | low (same wire format; keep a round-trip spec) | https://learn.microsoft.com/dotnet/api/system.buffers.text.base64url |
| `RandomNumberGenerator.GetString` | .NET 8 | no | `Lib/Utils/CryptoUtils.cs:27-43` (`RandomString`), 11 callers incl. `Modules/Auth/Services/SessionService.cs:59` | unbiased tokens; ~15 lines deleted | S | low (same alphabet and length) | https://learn.microsoft.com/dotnet/api/system.security.cryptography.randomnumbergenerator.getstring |
| `CryptographicOperations.FixedTimeEquals` | .NET Core 2.1 | no | `Modules/Auth/Utils/PasswordUtils.cs:45` | timing-safe compare | S | low | https://learn.microsoft.com/dotnet/api/system.security.cryptography.cryptographicoperations.fixedtimeequals |
| `TimeProvider` | .NET 8 | 3 files | 185 `DateTime.UtcNow` in 82 prod files, e.g. `Data/DbSetExtensions.cs:19`, `Modules/Auth/Services/SessionService.cs:80`; pattern already in `Lib/RateLimiting/RateLimitRejectionLogAggregator.cs:12` | testability, no flaky time tests | L | low per module | https://learn.microsoft.com/dotnet/standard/datetime/timeprovider-overview |
| `PeriodicTimer` | .NET 6 | no | `Task.Delay` loops in background services, e.g. `Infrastructure/Jobs/WorkerHeartbeatService.cs:41` | steadier cadence, slightly less code | S | low | https://learn.microsoft.com/dotnet/api/system.threading.periodictimer |
| `Guid.CreateVersion7` for new row ids | .NET 9 | yes (7) | `Modules/Jobs/Services/DeadLetterQueryService.cs:418` still uses `Guid.NewGuid()` for a job id | index locality, consistency with the UUIDv7 rule | S | low | https://learn.microsoft.com/dotnet/api/system.guid.createversion7 |
| Free runtime gains (PGO, DATAS GC, JIT) | .NET 8–10 | yes, by default | everything; nothing to configure (no GC overrides in `dokploy.yml`) | — | — | — | https://devblogs.microsoft.com/dotnet/performance-improvements-in-net-10/ |

## ASP.NET Core

| Feature | Version | Used? | Where it applies | Gain | Effort | Risk | Source |
|---|---|---|---|---|---|---|---|
| `HybridCache` for permission/tenant lookups | .NET 9 | no | `Lib/Filters/TenantPermissionFilter.cs:57`, `Lib/Filters/PermissionFilter.cs:51`, `Lib/Filters/TenantAuthFilter.cs:86,109` — 3–4 DB round-trips before each tenant handler | could remove 2–3 round-trips per request | M–L | **high**: a revoked permission or suspended tenant stays valid until the entry expires; needs tag invalidation on every write path. **Owner decision** | https://learn.microsoft.com/aspnet/core/performance/caching/hybrid |
| `ShortCircuit()` on health endpoints | .NET 8 | no | `Program.cs:375-384` | skips the middleware pipeline for probes | S | low (check probes need no header/CORS middleware) | https://learn.microsoft.com/aspnet/core/fundamentals/routing#short-circuit-middleware-after-routing |
| `IExceptionHandler` | .NET 8 | no (lambda in `UseExceptionHandler`) | `Lib/Extensions/CustomExceptionHandler.cs:247` | readability only | S | low | https://learn.microsoft.com/aspnet/core/fundamentals/error-handling#iexceptionhandler |
| Request timeouts middleware | .NET 8 | no | none needed today (outbound timeouts are per client) | — | — | — | https://learn.microsoft.com/aspnet/core/performance/timeouts |

## EF Core / Npgsql

| Feature | Version | Used? | Where it applies | Gain | Effort | Risk | Source |
|---|---|---|---|---|---|---|---|
| DbContext pooling with per-request tenant | EF 6 | no | `Lib/ServiceRegistration.cs:172` builds new options per request (`UseTenantId`) | 701 → 350 µs, 50 → 4.6 KB per context (docs benchmark) | M | medium: tenant must move from options to a property set by a scoped factory; any context state must reset | https://learn.microsoft.com/ef/core/performance/advanced-performance-topics#dbcontext-pooling |
| Compiled queries | EF 2 | no | `Modules/Auth/Services/SessionService.cs:82-88` (every authenticated request; also tracked, loads full `User`), account/tenant/permission lookups in the auth filters | 671 → 564 µs, 13 → 9 KB per query (docs) | S | low (must keep query syntax inside the lambda; scalar params only) | https://learn.microsoft.com/ef/core/performance/advanced-performance-topics#compiled-queries |
| Parameterized global query filter (`this.TenantId`) | EF 2 | partly | `Data/DbContext/AppDbContext.cs:438-448` uses `Expression.Constant` (see Concerns); `:416` already does it right | correctness | S–M | see Concerns | https://learn.microsoft.com/ef/core/querying/filters, https://learn.microsoft.com/ef/core/modeling/dynamic-model |
| Named query filters | EF 10 | no | only one filter per entity today (tenant); worth it only if soft delete becomes a filter; 17 prod `IgnoreQueryFilters()` sites would then ignore just one | readability, safety | S once #1 is fixed | low | https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew#named-query-filters |
| EF 10 parameterized collections (`IN (@p1, …)`) | EF 10 | yes, automatic | 5 `Contains` on ids | already free | — | — | https://learn.microsoft.com/ef/core/what-is-new/ef-core-10.0/whatsnew#improved-translation-for-parameterized-collection |
| Complex types / JSON columns | EF 8–10 | no | no owned/JSON-shaped entities found | — | — | — | https://learn.microsoft.com/ef/core/modeling/complex-types |

## JSON (System.Text.Json)

| Feature | Version | Used? | Where it applies | Gain | Effort | Risk | Source |
|---|---|---|---|---|---|---|---|
| `JsonSerializerOptions.Web` singleton | .NET 9 | no | 8 private copies of `new(JsonSerializerDefaults.Web)`, e.g. `Modules/Publishing/Providers/MastodonPublishProvider.cs:31`, `Modules/Messaging/Jobs/EmailJobHandlerBase.cs:76` | one shared, already read-only instance; 1 line each | S | low (only where the copy is never mutated) | https://learn.microsoft.com/dotnet/core/whats-new/dotnet-9/libraries#system-text-json |
| `RespectNullableAnnotations` | .NET 9 | no | `Infrastructure/Jobs/JobJson.cs:20` — job payloads already aim to be strict | a `null` in a non-nullable payload field fails at read, like a missing `required` field | S | low–medium (a stored payload with nulls would become a permanent failure; check existing rows) | https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/nullable-annotations |
| `AllowDuplicateProperties = false` / `JsonSerializerOptions.Strict` | .NET 10 | no | request bodies (JsonElement DTOs) | rejects `{"email":"a","email":"b"}` ambiguity | S | low–medium (check `JsonElement` parsing path is covered) | https://learn.microsoft.com/dotnet/core/whats-new/dotnet-10/libraries |

## Logging and diagnostics

| Feature | Version | Used? | Where it applies | Gain | Effort | Risk | Source |
|---|---|---|---|---|---|---|---|
| `[LoggerMessage]` source generator | .NET 6 | 1 file | 175 `Log*` calls in 47 files, 152 manual `IsEnabled` guards in 81 files (needed today because `CA1873` is enforced), e.g. `Modules/Invitations/Services/InvitationRevokeService.cs:125-157`, `Data/DbContext/AppDbContext.cs:308`. Template: `Lib/RateLimiting/PostgresRateLimitCounterStore.cs:405-450` | "eliminates boxing, temporary allocations and copies"; checks `IsEnabled` itself, so the guards go | M | low. Generated method names may not start with `_`, so keep the existing nested `LoggerMessages` class pattern (non-private methods) to satisfy `IDE1006`. Logs still flow MEL → Serilog → sanitizer sink | https://learn.microsoft.com/dotnet/core/extensions/logging/source-generation |

## Source generators

`[GeneratedRegex]` is done except one: `Lib/Utils/PathUtils.cs:7` still builds
`new Regex("/+", RegexOptions.Compiled)` (startup compile cost; the build passes, so `SYSLIB1045` does not catch
it here). S, low risk. Logging is above. JSON source generation and the options / configuration
binding generators are in "Not worth it".

## Testing

| Feature | Version | Used? | Where it applies | Gain | Effort | Risk | Source |
|---|---|---|---|---|---|---|---|
| `FakeTimeProvider` | .NET 8 | no | pairs with `TimeProvider`; 316 `DateTime.UtcNow` in tests | no sleeps, no clock races | with #10 | low | https://learn.microsoft.com/dotnet/api/microsoft.extensions.time.testing.faketimeprovider |
| Microsoft.Testing.Platform runner (+ xUnit v3) | .NET 10 `dotnet test` MTP mode | no (xunit 2.9.2, VSTest) | 2,918 tests | faster start, no VSTest host | M | medium (xUnit v3 migration) | https://learn.microsoft.com/dotnet/core/testing/microsoft-testing-platform-intro |

## Rejected — conflicts with a hard rule

| Feature | Rule it breaks |
|---|---|
| Expression-bodied members (C# 6/7) | `.editorconfig` block bodies (`IDE0021`–`IDE0027` as errors) |
| Primary constructors as a sweep (C# 12) | `_PascalCase` private fields + explicit `this.` access (`IDE1006`, `PUBLY0012`); parameters cannot be `this.`-qualified. 10 prod files already use them — not a pattern to spread |
| ASP.NET Core 10 built-in validation (`AddValidation`, DataAnnotations) and typed body DTOs | FluentValidation + `JsonElement` body rule (`csharp-coding-standards.md` DTO section, `PUBLY0005`) |
| EF 10 / .NET 10 `LeftJoin` method | "query syntax for database queries": the query-syntax form (`join … into … DefaultIfEmpty()`) exists and is used (5 sites) |
| `ConfigureAwait(false)` | explicitly banned in `csharp-coding-standards.md` |
| Switch expressions / list patterns on service error unions | "guard clauses over switch on error enums" |
| OpenTelemetry log exporter, `Serilog.Sinks.OpenTelemetry`, `Microsoft.Extensions.Compliance.Redaction` replacing the sanitizer | every log sink must stay behind the sanitizer (`Directory.Packages.props` note, `LoggerConfigExtensions.cs` invariant) |

## Not worth it

| Feature | Reason |
|---|---|
| EF compiled models | global query filters are not supported, and 40 DbSets is a small model |
| Native AOT / trimming | EF Core, FluentValidation, the reflection `[Service]` scan and Quartz are not AOT-friendly; startup is not a pain point |
| JSON source generation for HTTP | ~160 response types to register for a small throughput gain; bodies are `JsonElement` already |
| Output caching | every response depends on session and tenant |
| Server-Sent Events (`TypedResults.ServerSentEvents`, .NET 10) for the 5 s polls (`apps/front/src/routes/authed/tenant/posts/history.tsx:51`) | browser `EventSource` cannot send `X-Session-Token`; Kiota has no SSE support |
| `Microsoft.Extensions.Http.Resilience` retries | publishing calls are not idempotent; retries belong to the job queue and its idempotency keys |
| `SearchValues<T>` / `FrozenDictionary` sweep | 3 cold `IndexOfAny` sites; the 21 static dictionaries are small and off the hot path |
| `System.Threading.Channels` | the job queue is Postgres-backed by design |
| `UseQueryTrackingBehavior(NoTracking)` as default | write paths rely on tracking; 256 explicit `AsNoTracking` already |
| `EnableThreadSafetyChecks = false` | tiny gain, hides real bugs |
| Options validation / configuration-binding generators | `AppEnvironment` has its own FluentValidation-based loader |
| `Task.WhenEach`, `CountBy`/`AggregateBy`, `Index()` | no matching code |
| C# 14 extension members | same IL, no gain |
| .NET 10 file-based apps (`dotnet run app.cs`) | allowed by the languages rule, but `packages/scripts-cs` already covers tooling |

## .NET 11 vs today

Everything in the top 10 and in the tables above runs on .NET 10 today. The .NET 11 items (C# 15
unions, runtime async, EF 11 snapshot/migration improvements, minimal-API async validation —
rejected here anyway for the FluentValidation rule — Zstandard compression, OpenAPI 3.2) are already
listed in [#2325](https://github.com/PublyApp/publyapp/issues/2325).

## Concerns

1. **Tenant query filter baked into the cached model.** `Data/DbContext/AppDbContext.cs:438-448`
   adds the tenant filter only `if (this.TenantId is not null)` and with
   `Expression.Constant(this.TenantId)`. EF builds `OnModelCreating` once per context type and
   caches the model (no custom `IModelCacheKeyFactory`; `TenantExtension.GetServiceProviderHashCode`
   returns 0). So the filter of the **first** context created in the process applies to all later
   ones: no filter at all if that first context had no tenant (likely: startup, readiness, worker),
   or the first tenant's id for everyone otherwise. EF documents this:
   https://learn.microsoft.com/ef/core/modeling/dynamic-model. The `UserAccountRole` filter at `:416`
   references `this.TenantId` and is parameterized correctly. Services also filter by tenant
   explicitly (157 `.TenantId ==` sites), which would hide the problem. Not verified by running
   code: needs a spec that creates contexts for two tenants in one process. Fix shape: always add
   the filter, referencing the context member (as at `:416`), so EF parameterizes it.
2. `PasswordUtils` uses PBKDF2-HMAC-SHA256 with 100,000 iterations; OWASP's current guidance is
   600,000. Out of scope here (not a feature), worth an issue.
3. `CryptoUtils.EncryptString`/`DecryptString` decode the key from Base64 and allocate 4–5 arrays on
   every call; worth combining with #6 if encrypted ids sit on list endpoints.
