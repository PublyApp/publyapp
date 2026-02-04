# DI Strategy and Migration Plan (PublyApp / MainApi, .NET 10)

## 1. Executive Summary

This document defines the definitive Dependency Injection (DI) strategy for the Main API in PublyApp targeting .NET 10.

The strategy introduces attribute-based registration for **application services only**, enforces **strict fail-fast rules** (duplicates, invalid usage, missing primary interface, duplicate keys), adopts **string-only keyed DI** with **centralized lowercase key constants**, and restructures the composition root into three explicit registration groups: **Web**, **Infrastructure**, and **Application**.

Migration is phased to keep the app running continuously, with mandatory hygiene fixes completed before any attribute-based registration is enabled.

## 2. Current State (Phase 1 complete)

### Composition root

- `apps/api/Program.cs`
- Service registration is delegated to three explicit methods:
- `builder.AddWebServices()`
- `builder.AddInfraServices()`
- `builder.AddAppServices()`

### DI registrations

- `apps/api/Src/Lib/ServiceRegistration.cs` contains three registration methods:
  - `AddWebServices()`: ProblemDetails, OpenAPI, endpoint explorer, response compression, options binding/validation, HttpContextAccessor, CORS.
  - `AddInfraServices()`: Health checks, EF Core DbContext, Resend SDK client/adapters, email service implementation.
  - `AddAppServices()`: `I*Service` → `*Service` registrations from `MainApi.Src.Modules.*.Services`, FluentValidation, RequestAuthContext.
- DI validation is enabled at build/startup (`ValidateOnBuild`, `ValidateScopes`).

### Hygiene status (Phase 1 complete)

- ✅ Duplicate `IUserService` registration fixed (now registered exactly once).
- ✅ No temporary ServiceProvider creation in startup path (CORS reads from `IConfiguration` directly).
- ✅ `CorsConfigExtensions.cs` removed (CORS moved into `AddWebServices()`).

### FluentValidation

- Registered via `AddValidatorsFromAssemblyContaining<Program>()`.
- Must remain unchanged for now.

## 3. Target Architecture (Web / Infrastructure / Application boundaries)

### Core principle

`apps/api/Program.cs` is the **single composition root** and delegates to:

- `AddWebServices(...)`
- `AddInfraServices(...)`
- `AddAppServices(...)`

### Group boundaries

#### Web group

Responsible for ASP.NET Core and API surface wiring, including:

- ProblemDetails (RFC 7807)
- OpenAPI / API explorer
- Response compression
- CORS
- Web-only configuration (JSON options, auth middleware wiring, rate limiting, etc., if/when present)

#### Infrastructure group

Responsible for external capabilities and technical integrations, including:

- EF Core DbContext registration and database provider configuration
- External SDK clients and adapters (e.g., Resend)
- Messaging/email infrastructure components
- Health checks (when tied to infra dependencies)
- HttpClient + resilience policies (when/if introduced)
- Caching, background services, storage providers (when/if introduced)

#### Application group

Responsible **only** for business/application services, defined strictly as:

- Concrete classes under `MainApi.Src.Modules.*.Services`

Application group registration is performed via attribute-based scanning with strict constraints (see below).

## 4. Attribute-based Registration Design

### Scope

- Single assembly only: the Main API assembly.
- Namespace allowlist enforced: only types in `MainApi.Src.Modules.*.Services` are eligible.
- `[Service]` detected outside the allowed namespace is a hard startup error.

### Registration rules (authoritative)

- `[Service]` applies to concrete classes only.
- `[Service]` requires an explicit `ServiceLifetime`.
- Attribute-based registration registers ONLY the primary interface `I{ClassName}`.
- No register-as-self.
- No automatic secondary interface registration.
- Multiple business interfaces require explicit manual registration for the additional interfaces (outside the attribute scanner).

### Keyed vs unkeyed behavior (authoritative)

- Exactly one unkeyed default implementation per service type is allowed.
- Additional implementations for the same service type must be keyed.
- Two or more unkeyed implementations for the same service type is a hard startup error.

### Failure modes (fail-fast at startup; no warnings-only mode)

The application must fail fast at startup for:

- Duplicate registrations that violate the "one unkeyed default" rule
- Invalid attribute usage (attribute outside allowed namespace)
- Missing primary interface (`I{ClassName}` not found)
- Duplicate keys for the same service type (key collisions)

**Implementation details (Phase 2):**

- Validation runs inside `AddAppServices()` during service registration (before `builder.Build()`).
- Scanning scope: single Main API assembly only (via `ServiceScanner.ScanAssembly<Program>()`).
- Namespace allowlist: `MainApi.Src.Modules.*.Services` only (regex enforced).
- On any violation, startup fails with `InvalidOperationException` listing all errors as bullet points.
- See **Section 10: Troubleshooting** for detailed error categories and fixes.

### Non-goals / explicit exclusions

Attribute-based registration is not used for:

- Framework wiring (ProblemDetails, OpenAPI, CORS, compression, etc.)
- Infrastructure wiring (DbContext, SDK clients, adapters, hosted services, etc.)
- Request-context plumbing (e.g., request auth context)

FluentValidation registration remains unchanged for now.

## 5. Keyed DI Strategy and Key Governance

### Key type and usage

- Key type is string only.
- Keys must be centralized constants.
- No inline strings in attributes or injection points.

### Key locations and structure

Keys live in multiple domain-specific static classes, for example:

- `ProviderKeys`
- `StorageKeys`
- `IntegrationKeys`

### Key conventions (authoritative)

- Keys are lowercase.
- Keys are stable identifiers (treat as contracts).
- Allowed characters: `[a-z0-9._-]` (no whitespace/control chars).

### Operational governance

Any new keyed service introduction must include:

- Adding a constant in the appropriate keys class
- Ensuring no collisions within the service type’s keyed registrations
- Documenting the intended use and default selection behavior (if applicable)

### Optional diagnostics

DI manifest logging is implemented and gated by configuration:

- **Config flag**: `AppSettings:DI_MANIFEST_ENABLED` (optional, defaults to `false`)
- **Enable**: Set `"DI_MANIFEST_ENABLED": true` in appsettings.json
- **Recommended**: Enable only in Development or when debugging DI issues.
- **Output**: Lists discovered `[Service]` attributed registrations with: service type, implementation type, lifetime, and key (if any).
- **Logging**: Uses the configured Serilog pipeline (via `Serilog.Log`) from within `AddAppServices()` (no temporary ServiceProvider).
- Diagnostics do not replace fail-fast behavior for invalid states.

## 6. Migration Plan (PHASED)

### Phase 0: documentation and governance (mandatory before cutover)

Objective: ensure the team has a single, enforceable reference for DI rules and keyed DI governance (in `AGENTS.md`), plus a clear migration workflow (in this document) before attribute-based registration is enabled for runtime resolution.

Deliverables:

- Maintain the canonical DI rules and governance in `AGENTS.md` under “Dependency Injection Rules”.
- Commit/maintain this document (`docs/di-strategy.md`) as the DI migration plan and phased roadmap (it is not referenced from `AGENTS.md` by design).
- Add a concise “How to add a new application service” checklist covering:
- Allowed namespaces for `[Service]`
- Primary interface requirement `I{ClassName}`
- Lifetime selection rules (explicit, reviewable)
- Duplicate implementation/key rules (one unkeyed default; all additional keyed)
- Key governance (lowercase constants only; no inline strings)
- Add a concise “How to add a new keyed implementation” checklist covering:
- Which keys class to use (`ProviderKeys`, `StorageKeys`, `IntegrationKeys`, etc.)
- Naming conventions (lowercase, stable identifiers)
- Collision avoidance expectations (service-type scoped uniqueness)

Acceptance criteria:

- A single canonical reference exists in `AGENTS.md` for DI rules and keyed DI governance.
- Reviewers have a concrete checklist to validate new services and keyed implementations during PR review.

### Phase 1: regrouping + hygiene fixes ✅ COMPLETE

Objective: restructure DI into Web/Infrastructure/Application groups without behavior changes, and fix known DI hygiene issues before introducing attributes.

Deliverables:

- ✅ Introduced `AddWebServices(...)`, `AddInfraServices(...)`, `AddAppServices(...)` in `ServiceRegistration.cs`.
- ✅ Updated `apps/api/Program.cs` to call these group methods as the sole registration entry points.
- ✅ Fixed duplicate `IUserService` registration (exactly one registration remains).
- ✅ Removed temporary ServiceProvider creation (CORS now reads from `IConfiguration` directly).
- ✅ FluentValidation registration unchanged.

Acceptance criteria:

- ✅ App builds and boots with DI validation enabled.
- ✅ Endpoints function as before.
- ✅ No temporary ServiceProvider creation remains in startup path.
- ✅ `Program.cs` is clearly the single composition root delegating to the three groups.

### Phase 2: attribute infrastructure (no behavior change) ✅ COMPLETE

Objective: introduce attribute + scanning infrastructure while preserving runtime behavior (explicit registrations remain the source of truth).

Deliverables:

- ✅ Added `[Service]` attribute definition (`Src/Lib/DI/ServiceAttribute.cs`).
- ✅ Added single-assembly scanner limited to `MainApi.Src.Modules.*.Services` (`Src/Lib/DI/ServiceScanner.cs`).
- ✅ Implemented startup-time validation logic per fail-fast rules (`Src/Lib/DI/ServiceValidator.cs`).
- ✅ Explicit registrations remain authoritative (no cutover yet).
- ✅ Added DI manifest logging (gated by `AppSettings:DI_MANIFEST_ENABLED`, defaults to `false`).
- ✅ Scanner handles `ReflectionTypeLoadException` with actionable error output.

Acceptance criteria:

- ✅ App boots successfully with explicit registrations still active.
- ✅ Scanner enforces constraints and fails fast on:
  - Abstract classes or open generics (concrete classes only)
  - Attribute outside allowed namespace
  - Missing `I{ClassName}`
  - Empty/whitespace keys or non-lowercase keys
  - Duplicate unkeyed implementations per service type
  - Duplicate keys per service type
  - Assembly type load failures (wraps `ReflectionTypeLoadException` with diagnostics)
- ✅ DI manifest logging uses the configured Serilog pipeline (not an ad-hoc console logger).
- ✅ DI manifest is opt-in via `AppSettings:DI_MANIFEST_ENABLED` (defaults to `false`).
- ✅ Service resolution behavior remains unchanged in this phase.

### Phase 2.5: documentation updates (mandatory before Phase 3) ✅ COMPLETE

Objective: finalize developer-facing documentation and review guardrails once the attribute scanner exists and its failure modes are confirmed.

Deliverables:

- ✅ Updated `docs/di-strategy.md` to match current implemented behavior:
  - Validation runs in `AddAppServices()` during service registration.
  - Manifest logging occurs once during startup (after `builder.Build()`), gated by `AppSettings:DI_MANIFEST_ENABLED`.
  - Explicit registrations remain authoritative in Phase 2.
  - Scanning scope: single Main API assembly only.
  - Namespace allowlist: `MainApi.Src.Modules.*.Services` only.
- ✅ Added **Section 10: Troubleshooting** with all fail-fast error categories, causes, and fixes.
- ✅ Documented expected error shape (startup fails with `InvalidOperationException`, errors listed as bullet points).

Acceptance criteria:

- ✅ Documentation matches the actual enforced behavior of the scanner and startup validation.
- ✅ Engineers can resolve common migration errors using documented guidance (see Section 10).

### Phase 3+: incremental cutover to attribute-based registration

Objective: migrate application services to attribute-based registration module-by-module, keeping the app stable throughout.

Cutover approach (per domain module):

- Annotate eligible concrete services in `MainApi.Src.Modules.<Domain>.Services` with `[Service]`.
- Remove the corresponding explicit registrations from `AddAppServices(...)` only after startup validation is clean for that service type.
- If a service must be resolved via additional business interfaces, add explicit manual registrations for those additional interfaces (attribute does not do this).

Acceptance criteria (per module):

- App boots with no DI errors.
- Endpoints that use the module behave as before.
- No infra/framework services are registered via attributes.
- No duplicate-unkeyed or duplicate-key violations.

End state:

- `AddAppServices(...)` relies on attribute scanning for application services.
- Explicit registrations remain only for Web and Infrastructure groups and for manual secondary-interface bindings.

## 7. Risks and Mitigations

- Risk: attribute-based DI reduces wiring visibility.
- Mitigation: single-assembly scanning + strict namespace allowlist; recommended DI manifest; fail-fast enforcement.

- Risk: misuse of `[Service]` on infrastructure/framework types causes hidden runtime behavior changes.
- Mitigation: hard startup error when attribute is outside `MainApi.Src.Modules.*.Services`.

- Risk: multiple implementations become ambiguous as keyed DI grows.
- Mitigation: enforce exactly one unkeyed default; require keys for all additional implementations; fail fast on duplicates and key collisions.

- Risk: missing primary interface breaks registration.
- Mitigation: fail fast at startup; migrate module-by-module to localize impact.

- Risk: lifetime mismatch errors (e.g., singleton depending on scoped).
- Mitigation: keep DI validation enabled; explicit lifetime in attribute forces conscious selection and review.

## 8. Final Checklist Before Implementation

- `apps/api/Program.cs` delegates only to `AddWebServices(...)`, `AddInfraServices(...)`, `AddAppServices(...)`.
- Duplicate `IUserService` registration is removed and verified.
- No `BuildServiceProvider()` (or equivalent temporary container creation) remains in startup code paths, especially CORS.
- FluentValidation registration remains unchanged (`AddValidatorsFromAssemblyContaining<Program>()`).
- `[Service]` usage constraints are enforceable:
- Concrete classes only
- Only under `MainApi.Src.Modules.*.Services`
- Explicit lifetime required
- Optional string key supported (keys are centralized constants and lowercase)
- Fail-fast validations are defined for:
- Duplicate unkeyed implementations
- Invalid attribute usage
- Missing primary interface
- Duplicate keys
- Migration sequence is agreed and enforced:
- Documentation phase completed (Phase 0 and Phase 2.5).
- Phase 1 prerequisites complete before Phase 2 starts
- Phase 2 introduces attribute infrastructure with no behavior change
- Phase 3+ migrates incrementally with per-module acceptance checks
- Optional (recommended): decide whether to emit a DI manifest at startup for attributed services (not required for MVP).

## 9. Quick Reference Checklists

### How to Add a New Application Service

Use this checklist when creating a new domain service:

- [ ] **Namespace**: Place concrete class under `MainApi.Src.Modules.<Domain>.Services` (required for attribute-based registration eligibility)
- [ ] **Primary interface**: Define `I{ClassName}` interface in the same file or namespace (e.g., `UserService` → `IUserService`)
- [ ] **Explicit lifetime**: Specify `ServiceLifetime` explicitly when registering (Scoped, Transient, or Singleton). Document your choice in PR if non-obvious.
- [ ] **One unkeyed default**: Ensure exactly one unkeyed registration per service type. If another implementation already exists unkeyed, your new implementation must be keyed.
- [ ] **Key governance (if keyed)**: Use a constant from the appropriate keys class (`ProviderKeys`, `StorageKeys`, `IntegrationKeys`). Never use inline strings.
- [ ] **Registration location**: Register in `AddAppServices(...)` (explicit registration until attribute cutover is complete).

### How to Add a New Keyed Implementation

Use this checklist when adding a second (or nth) implementation of an existing service interface:

- [ ] **Identify keys class**: Choose the appropriate keys class based on the service category:
  - `ProviderKeys` — provider/adapter implementations (e.g., email providers, auth providers)
  - `StorageKeys` — storage backends (e.g., file storage, blob storage)
  - `IntegrationKeys` — external integrations (e.g., payment gateways, notification services)
  - Create a new keys class if none of the above fit; follow the same pattern.
- [ ] **Add key constant**: Add a `public const string` to the keys class. Use lowercase, stable identifiers (e.g., `"resend"`, `"sendgrid"`, `"local"`).
- [ ] **Collision check**: Verify no other implementation of the same service type uses this key.
- [ ] **Document intent**: Add a brief comment on the constant if the key's purpose is not self-evident.
- [ ] **Register with key**: In `AddAppServices(...)` (or `AddInfraServices(...)` for infra services), register using `.AddKeyed*<TService, TImplementation>(YourKeys.YourKey)`.
- [ ] **Injection point**: At the consumer, use `[FromKeyedServices(YourKeys.YourKey)]` to inject the specific implementation.

## 10. Troubleshooting: Fail-Fast Validation Errors

When `[Service]` attribute validation fails, the application throws an `InvalidOperationException` at startup (during `AddAppServices()`). The exception message lists all violations as bullet points.

**When errors occur:** During service registration, before `builder.Build()` completes. The app will not start.

**Error message shape:**
```
[Service] attribute validation failed with the following errors:

  - [error 1]
  - [error 2]
  ...
```

### Abstract class / open generic not allowed

**What it means:** The `[Service]` attribute was applied to an abstract class or an open generic type (e.g., `MyService<T>`).

**Common causes:**
- Accidentally marking a base class with `[Service]`
- Applying `[Service]` to a generic service definition instead of a closed generic

**How to fix:**
- Remove `[Service]` from abstract classes
- For generics, apply `[Service]` only to closed generic types (e.g., `MyService<string>`) or use explicit registration

### Invalid namespace

**What it means:** The `[Service]` attribute was applied to a class outside the allowed namespace pattern `MainApi.Src.Modules.*.Services`.

**Common causes:**
- Placing a service class in `Src/Lib/` or `Src/Infrastructure/` instead of `Src/Modules/<Domain>/Services/`
- Typo in namespace declaration
- Service class in a namespace that does not match the allowlist pattern

**How to fix:**
- Move the class to `MainApi.Src.Modules.<Domain>.Services`
- Or remove `[Service]` and use explicit registration in `AddAppServices()` or `AddInfraServices()`

### Missing primary interface I{ClassName}

**What it means:** The class has `[Service]` but does not implement an interface named `I{ClassName}`.

**Common causes:**
- Forgot to create the interface
- Interface name doesn't match (e.g., class `UserService` but interface `IUserSvc`)
- Interface is in a different assembly

**How to fix:**
- Create an interface named `I{ClassName}` (e.g., `UserService` → `IUserService`)
- Ensure the class implements this interface
- Place the interface in the same namespace or a namespace the class can reference

### Empty/whitespace key

**What it means:** A `[Service]` attribute was given a key that is empty string or whitespace.

**Common causes:**
- Using `[Service(ServiceLifetime.Scoped, "")]` or `[Service(ServiceLifetime.Scoped, "   ")]`
- Passing a constant that evaluates to empty

**How to fix:**
- Use `null` for unkeyed registration: `[Service(ServiceLifetime.Scoped)]`
- Or use a valid non-empty key constant

### Non-lowercase key

**What it means:** The key provided is not all lowercase.

**Common causes:**
- Using `"Resend"` instead of `"resend"`
- Using `"SendGrid"` instead of `"sendgrid"`

**How to fix:**
- Change the key constant to lowercase
- Keys are treated as contracts; use stable lowercase identifiers

### Duplicate unkeyed implementations

**What it means:** Two or more classes with `[Service]` (without a key) implement the same interface.

**Common causes:**
- Adding a new implementation without realizing one already exists
- Forgetting to add a key to the new implementation

**How to fix:**
- Keep exactly one unkeyed (default) implementation
- Add a key to additional implementations using a keys constant (e.g., from `ProviderKeys`, `StorageKeys`, `IntegrationKeys`)
- Use `[FromKeyedServices(YourKeys.YourKey)]` at injection points for non-default implementations (no inline strings)

### Duplicate keys

**What it means:** Two or more classes with `[Service]` use the same key for the same service interface.

**Common causes:**
- Copy-paste error when adding a new keyed implementation
- Two developers independently adding implementations with the same key

**How to fix:**
- Use unique keys per service type
- Check the keys class for existing constants before adding new ones
- Coordinate with team on key naming

### Assembly type load failure (ReflectionTypeLoadException)

**What it means:** The scanner could not load all types from the assembly, typically due to missing dependencies or build issues.

**Common causes:**
- Missing assembly reference
- Incompatible dependency version
- Corrupted build output

**How to fix:**
- Run `dotnet clean` followed by `dotnet build`
- Check for missing NuGet package references
- Review the loader exception messages in the error output (up to 10 distinct messages are shown)
- Verify all project references are correct

### Registration conflict (half-migrated state)

**What it means:** A service interface has both an explicit registration in `AddAppServices()` AND a `[Service]` attribute on its implementation class.

**Common causes:**
- Forgot to remove the explicit registration after adding `[Service]` attribute
- Two developers made conflicting changes (one added attribute, one kept explicit)
- Partial migration where attribute was added but explicit registration wasn't cleaned up

**How to fix:**
- Remove the explicit registration from `AddAppServices()` for the conflicting service
- Once a service is migrated to `[Service]`, the attribute owns that service's DI registration
- Keep explicit registrations only for services not yet migrated to attribute-based registration
