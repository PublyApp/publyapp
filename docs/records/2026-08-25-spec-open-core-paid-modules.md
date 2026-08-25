# Spec — Open-core paid modules (contracts, signed loader, feature gate, pro image)

Status: design validated section by section with the owner on 2026-08-25 (brainstorm). Implementation is split into rungs (§10); each rung is its own issue and PR.

## 1. Goal

Let PublyApp stay a fully open-source, self-hostable product while some features are sold. A paid feature is a **module**: a closed-source .NET assembly built in a private monorepo, loaded by the public core at startup, activated by a licence (self-hosted) or a subscription (SaaS). Every screen, including the screens of paid features, lives in the public core behind runtime feature flags. The community contributes to the core; there is no third-party plugin marketplace.

Order of the first paid modules, as decided: **C** publishing channels → **A** analytics/reports → **B** AI assistance → **D** enterprise (SSO, quotas, white-label, audit export). If the contract carries C, it carries A, B and D by subset.

## 2. Non-goals (v1)

- Third-party or community plugins running in the core process (community changes go to the core itself).
- Hot reload / unload of modules (a module change requires a restart).
- Modules that ship UI (all UI is in `apps/front`, feature-flagged).
- A marketplace, in-app download of modules, or automatic instance cut-off from the licence monitor.
- Sandboxing (WASM/containers). Only assemblies signed by the owner are ever loaded, so isolation is by trust, not by runtime.

## 3. Constraints inherited from the repo

- Every failure shows its cause in plain words (ProblemDetails + `ResponseKeys`, en + fr). A module never invents its own error channel.
- Guards fail loud on anything they cannot parse or verify: unsigned assembly, unknown manifest field, licence with a bad signature, missing `PUBLY_FEATURE_SOURCE` → refuse, with the reason.
- No suppression comments, no guard loosening, class methods stay methods, TDD with paired proofs, integration + architecture specs on every rung (see `docs/guides`).
- New required environment variables are wired everywhere at once: `AppEnvironment`, `.env.example`, Dockerfile/compose/`dokploy.yml`, CI workflows, runbook, seeder (#1239 lesson).

## 4. Architecture overview

```
apps/api (public core)
├── PublyApp.Modules.Abstractions   ← public NuGet package (semver), the only thing modules compile against
├── Lib/Modules/                    ← loader: discover, verify signature, check CoreVersionRange, register
├── Lib/Features/                   ← IFeatureGate + LicenseFeatureSource | SubscriptionFeatureSource
├── Modules/Sample/                 ← open-source sample module exercising every registry (tests + docs)
└── /api/modules/<id>/…             ← module endpoints, same auth/permission pipeline as the core

(private side: module projects compiled against Abstractions, signed, shipped as a pro image — documented outside this repository)
```

## 5. Contracts package — `PublyApp.Modules.Abstractions`

Lives in the core repo, published to nuget.org on every tagged core release, **strict semver**. A module declares the core versions it accepts; the loader refuses anything outside the range.

```csharp
public interface IPublyModule
{
    ModuleManifest Manifest { get; }
    void ConfigureServices(IModuleServiceBuilder builder);
    Task OnActivatedAsync(IModuleContext context, CancellationToken ct);
}

public sealed record ModuleManifest(
    string Id,                       // "channel-linkedin", "analytics", …  (kebab-case, stable forever)
    Version Version,
    VersionRange CoreVersionRange,   // e.g. [1.4, 2.0)
    IReadOnlyList<string> RequiredFeatures); // feature keys that must be active for the module to be "active"
```

`IModuleServiceBuilder` exposes **only** what the core already knows how to do for its internal modules — no access to `WebApplication`:

| Registry | Maps to (existing core mechanism) |
|---|---|
| `AddEndpoints(Action<RouteGroupBuilder>)` | `Routes.*.cs`, mounted under `/api/modules/<id>` |
| `AddJobHandler<T>()` | job runtime, `JobKey`, DLQ, retention, alerts |
| `AddPermissions(params PermissionDefinition[])` | `AppPermissions`, ForStaff/ForTenant scopes |
| `AddResponseKeys(Assembly resources)` | `ResponseKeys` catalogue, merged with prefix `modules.<id>.*` |
| `AddDbContext<T>(schema: "mod_<id>")` | EF DbContext + migrations owned by the module |
| `AddPublishProvider<T>()` | `IPublishProvider` (epic D, #644) — for channel modules |
| `AddContentTransformer<T>()` | pre-publish transformation hook — for AI/content modules |

The public surface of the package is guarded by an **API-baseline test** (`Microsoft.CodeAnalysis.PublicApiAnalyzers` or equivalent): any change to the visible surface fails CI until the version is bumped according to semver and the baseline is updated in the same PR. A breaking change is blocked until a compatible version of every published module is ready (owner's call, recorded in the PR).

## 6. Loader (core)

1. Reads `PUBLY_MODULES_DIR` (default `/app/modules`). Missing directory = no modules, logged once.
2. For each `*.dll`: verifies the **signature** against the owner's public key embedded in the core (Authenticode-style detached signature file `<name>.dll.sig`, Ed25519). Unsigned or bad signature → the process **refuses to start**, naming the file. This applies to self-hosted instances too. `PUBLY_MODULES_ALLOW_UNSIGNED=1` is accepted only when `ASPNETCORE_ENVIRONMENT != Production`; otherwise it is itself a startup error (same doctrine as the canary probe flag, #1319).
3. Loads the assembly in a **non-collectible** `AssemblyLoadContext`; host-provided assemblies (ASP.NET, EF, `Abstractions`, logging) resolve to the host's copies — modules reference them with `Private=false` / `ExcludeAssets=runtime`.
4. Reads the manifest, checks `CoreVersionRange`, calls `ConfigureServices`.
5. After the host is built, calls `OnActivatedAsync` for modules whose `RequiredFeatures` are active: this is where module migrations run, under a Postgres advisory lock (same mechanism as the core's startup migration) so replicas do not race.

**Loaded but inactive**: a module whose features are not active is still loaded; its endpoints answer `402 feature_not_licensed` (ProblemDetails, en/fr), its jobs are not scheduled, its publish providers are registered but marked *unlicensed*. Activation is a read of `IFeatureGate` with a short cache, so turning a licence on does **not** require a restart; only adding or removing a DLL does.

## 7. Feature gate (core) — the single source of truth

```csharp
public interface IFeatureGate
{
    bool IsActive(string featureKey);                 // cached, cheap
    FeatureState Describe(string featureKey);         // Active | AvailableWithLicense | Unknown
    IReadOnlyList<FeatureDescriptor> All();
}
```

`PUBLY_FEATURE_SOURCE` is **mandatory** and explicit: `license` or `subscription`. Missing, unknown, or contradicted (a licence key present in `subscription` mode, or a subscription table configured in `license` mode) → refuse to start with the reason.

- `LicenseFeatureSource` (self-hosted): reads `PUBLY_LICENSE_KEY` (env, wins) or the licence stored by the staff UI (encrypted with the existing master-key mechanism). Verifies the Ed25519 signature offline, exposes the state (valid / expires in N days / expired-in-grace / invalid with reason) on the staff "Licence" page and in `/api/features`.
- `SubscriptionFeatureSource` (SaaS): reads `TenantSubscription` (plan, features, status, `currentPeriodEnd`), fed by the billing provider through signed webhooks (Billing module, existing permissions skeleton).

The front consumes `/api/features` once per session (and on focus) and renders three states per feature: **active**, **available with a licence** (invitation screen, nothing deleted), **unknown** (nothing rendered). The server enforces the same gate on every module endpoint; the front flag is a convenience, never the guard. This closes #1051 (runtime evaluation, one source of truth, typed registry, per-tenant targeting, visibility, audit of flag changes).

## 8. Licences and subscription (public summary)

The core only needs to know: a self-hosted licence is an Ed25519-signed token verified offline against the public key embedded in the core (`licenseId`, `features[]`, `expiresAt`, `graceDays`, optional instance binding); an instance fingerprint (random id generated at first boot, stored in the database, shown on the staff Licence page) may be compared to the licence when binding is used; a non-blocking periodic refresh call reports `licenseId, fingerprint, coreVersion, loadedModules[]` to the owner's licence service when the network allows (no personal or business data). The SaaS path reads the tenant subscription instead (§7). Issuance, renewal, revocation, trial rules, monitoring and the delivery pipeline are the owner's private operations and are documented outside this repository.

## 9. Delivery (what the core must support)

Paid modules reach an instance as signed assemblies under `PUBLY_MODULES_DIR` (in practice, a `publyapp-api-pro` image built privately on top of the public `publyapp-api` image of the same version). The core never downloads modules itself in v1. Each module's OpenAPI document and its kiota client are committed into the core by an automated PR containing only generated, non-secret code (§9.1).

### 9.1 `packages/client-ts` layout — one client per module, same package

```
packages/client-ts/
  src/core/                ← today's client, moved as-is (kiota -o src/core, its own kiota-lock.json)
  src/modules/<id>/        ← one kiota client per module, generated from apps/api/openapi-modules/<id>.json
                              (its own kiota-lock.json, class <Id>Client, namespace PublyApp.Api.Client.Modules.<Id>)
```

`package.json` exports keep every existing import working:

```json
"exports": {
  "./modules/*": { "types": "./src/modules/*.ts", "default": "./src/modules/*.ts" },
  "./*":         { "types": "./src/core/*.ts",    "default": "./src/core/*.ts" }
}
```

Rules: the core regeneration (`just` recipe, `-o src/core`) never touches `src/modules/**` (proved by a drift test that regenerates the core and asserts `src/modules/**` is byte-identical); the module drift gate regenerates `src/modules/<id>` from the **committed** `apps/api/openapi-modules/<id>.json` so the public CI never needs the pro image; `apps/api/openapi-modules/` and `src/modules/` are bot-only (CODEOWNERS + a guard refusing manual edits); the six imports that bypass `exports` via `@org/client-ts/src/...` are rewritten in step 0. Module clients share nothing with the core client (no shared models); they use the same `requestAdapter`, hence the same session, cookies/tokens and interceptors — **authentication needs nothing new**: module endpoints run in the same process behind the same middleware and permission checks.

### 9.2 Release sequence

core `X.Y.Z` tagged → `Abstractions` published → pro built on `X.Y.Z` → bot PR (openapi-modules + clients) on core → merged into the next core release. A module's UI is therefore visible one core release after the module ships; the "unknown feature renders nothing" state covers the gap.

### 9.3 Local development

`just pro-up` in the private monorepo runs the core compose stack with `PUBLY_MODULES_DIR` pointing at `modules/*/bin/Debug` and `PUBLY_MODULES_ALLOW_UNSIGNED=1` (non-production only, §6).

## 10. Rungs (each an issue + PR, in order)

0. **client-ts layout**: `git mv src/* src/core/`, exports map, `just`/`package.json` recipes, drift gate updated, six bypassing imports rewritten. No behaviour change.
1. **Runtime feature gate** (#1051): `IFeatureGate`, `/api/features`, `PUBLY_FEATURE_SOURCE`, `LicenseFeatureSource` with the Ed25519 verifier, staff Licence page (states + fingerprint), front `useFeature()` with the three states, audit of flag/licence changes.
2. **Contracts + loader + Sample**: `PublyApp.Modules.Abstractions` (API-baseline guard, NuGet publish on tag), loader with signature verification and version range, `Modules/Sample` exercising every registry, integration + architecture specs (unsigned DLL refused, out-of-range refused, inactive module answers 402, migrations under advisory lock).
3. **Channel contract public**: `IPublishProvider`, `ProviderFailure`, capabilities, `AddPublishProvider<T>()`; core-owned `SocialAccount`/`ITokenProtector` reused (epics C/D); the Sample gains a fake channel.
4. **`SubscriptionFeatureSource`** + Billing webhooks (SaaS).
5. Private side (monorepo bootstrap, first paid channel module): tracked outside this repository.

## 11. Decisions recorded (owner, 2026-08-25)

- Modules are the owner's only; community → core. UI stays in the core behind feature flags.
- Unsigned assemblies are refused everywhere, including self-hosted; the only escape is non-production.
- "Loaded but inactive" rather than "absent" so the UI can invite to a licence.
- #1051 becomes rung 1.
- Tokens/accounts owned by the core; module schema per module + migrations at activation; module endpoints under `/api/modules/<id>/`.
- Module kiota clients pushed into the core by a bot PR, under `packages/client-ts/src/modules/<id>`; contract breaks blocked by an API-baseline guard.
- Instance binding supported but optional; `PUBLY_FEATURE_SOURCE` explicit with refusal to start when missing or contradicted. Commercial parameters (grace, trial, monitoring thresholds) are private.

## 12. Success criteria

- A signed module DLL dropped in `PUBLY_MODULES_DIR` registers endpoints, jobs, permissions, response keys and its own schema; an unsigned one stops the process with a named reason.
- With `PUBLY_FEATURE_SOURCE=license` and a valid licence, the module's features are active without restart after the licence is entered; expired-in-grace and revoked states are visible in plain words on the Licence page and in `/api/features`.
- With `PUBLY_FEATURE_SOURCE=subscription`, the same features follow `TenantSubscription`.
- The public CI proves: the core client regeneration leaves `src/modules/**` untouched; module clients match their committed OpenAPI documents; the contracts' public surface is unchanged or the version was bumped.
- The Sample module's specs cover every registry and every refusal path; the private monorepo's tests load the modules into the pinned public image.
