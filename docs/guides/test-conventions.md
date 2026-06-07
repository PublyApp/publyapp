# Test Conventions

> Extracted from `AGENTS.md` — testing conventions for the PublyApp API.

## Test File Naming

- Spec files use `*.Spec.cs` suffix (not `*.IntegrationTests.cs`)
- Class name = `{Feature}Spec` (e.g., `CreateSystemNoticeSpec`, `PasswordLoginSpec`)
- Co-located next to the handler/source they test
- Unit test specs co-locate next to their source file (e.g., `DateUtils.Spec.cs` next to `DateUtils.cs`)

## Test Method Naming (BDD)

- Use `ItShould{Expected}{Connector}{Scenario}` format, where `{Connector}` is a
  natural-language linker — typically `When` (state/trigger), but `With`, `Without`,
  and `For` are equally valid where they read more naturally (precondition/actor/input).
- Always start with `ItShould`
- No underscores in method names
- Examples: `ItShouldReturnOkWhenDataIsValid`, `ItShouldReturnOkWithValidData`,
  `ItShouldReturnUnauthorizedWithoutAuth`, `ItShouldReturn403ForNonMember`
- Rationale: enforcement was evaluated and declined (spike #536, NO-GO) — the suite
  uses these connectors idiomatically across ~160+ methods; reviewers enforce the
  spirit (clear Expected + Scenario), not a literal `When` token.

## Testing/ Folder Structure

Test infrastructure lives in `Lib/Testing/` organized by purpose:

- `Testing/Fixtures/` — test environment setup (`ApiFixture`, `ApiFactory`, `PostgresContainerFixture`, `DatabaseTemplateManager`, `TestEnvironment`, `TestConstants`)
- `Testing/Helpers/` — test utility methods (`TestAuthClient`, `TenantTestHelper`, `SystemNoticeTestHelper`, `HttpRequestMessageExtensions`)
- `Testing/Fakes/` — test doubles (`FakeEmailSender`)
- NO test cases in Testing/ — specs live co-located with source

## Architecture Tests (executable guardrails)

Many backend conventions live only as prose in `AGENTS.md` and the guides — which
means they get missed in review and silently regress. Architecture tests turn the
highest-value conventions into **executable guardrails**: plain xUnit specs that
scan the compiled model/assembly (via reflection) and **fail the build** when a
convention is violated. They run in the normal API test project, need no Docker,
and report the concrete offender (type / property / constant), not a generic
failure.

They live in `Lib/Architecture/` and follow the standard spec conventions:

- `*.Spec.cs` suffix; namespace `PublyApp.Api.Lib.Architecture`.
- A shared reflection helper, `Lib/Testing/Helpers/ArchitectureDiscoveryHelper`,
  enumerates handler types, HTTP wire DTO records, service types, and route
  constants while excluding generated/build artifacts. New guards reuse it rather
  than re-scanning the assembly ad hoc.
- Every guard includes a **vacuity check** (assert discovery is non-empty) so a
  broken filter can't make the guard pass for the wrong reason.

### Current guards

- `ArchitectureGuard.Spec.cs` — no `PatchField<T>` in HTTP wire DTOs; junction
  tables use composite keys (no `Id`/soft-delete columns); `Session` rows carry no
  soft-delete columns.
- `RouteConstraintGuard.Spec.cs` — route path constants must not use inline route
  constraints (`:guid`/`:int`). IDs are parsed in handlers with `Guid.TryParse`, so
  a malformed ID returns 400 (BadRequest); an inline constraint would silently
  regress that to a route-level 404.
- `HandlerContractGuard.Spec.cs` — locks in the #431 handler file contract: the
  public Minimal-API entrypoint is named exactly `Handle` (no leftover
  `Handle{Operation}`); handlers never inject/store/parameterize `AppDbContext`;
  handler classes expose no public nested types (contract + validator types are
  top-level siblings); and every `AbstractValidator<T>` in a handler namespace
  targets a top-level `Body`/`Query` type. (The "file name matches primary class"
  half of #357 B.5 is deferred to the #350 Roslyn track — multi-handler files make a
  filesystem rule brittle — and the "namespace matches folder" half is already
  enforced at build by `IDE0130`.)
- `ServiceArgsRecordConvention.Spec.cs` — any public domain-service interface method
  with 3+ parameters (excluding `CancellationToken`) must collapse them into a single
  `{Action}{Domain}Args` record. Uses an explicit, justified allowlist to baseline
  pre-existing exceptions (baseline-then-ratchet), retains positive coverage for
  methods that already adopt args records, and self-prunes stale allowlist entries.

### Architecture test vs Roslyn analyzer — which to use

Use an **architecture test** (here) when the rule is checkable from the compiled
assembly: reflected types, endpoint metadata, route constants, constructor
dependencies, or simple repo structure. Use a **Roslyn analyzer** (tracked by
#350) when the rule needs syntax, invocation shape, control flow, or
IDE/build-time feedback — e.g. forbidding `?? throw`, the null-forgiving `!`, or
`TypedResults.Forbid()` at a call site. Issue #357 owns the full classification
and backlog; analyzer-backed rules wait on the #350 framework.

### Adding a new guard

1. Add a `*.Spec.cs` in `Lib/Architecture/` (namespace `PublyApp.Api.Lib.Architecture`).
2. Discover the types/constants via `ArchitectureDiscoveryHelper` (extend it if a
   new category is needed).
3. Assert there are no offenders, listing concrete names in the failure message.
4. Add a vacuity check so the guard can't pass on an empty scan.
5. If current code isn't clean yet, baseline/allowlist the known violations and
   ratchet toward zero rather than weakening the rule.

## Test Using Statements

Spec files reference test infrastructure via sub-namespaces:

```csharp
using PublyApp.Api.Lib.Testing.Fixtures;  // ApiFixture, TestConstants
using PublyApp.Api.Lib.Testing.Helpers;    // TestAuthClient, TenantTestHelper
using PublyApp.Api.Lib.Testing.Fakes;      // FakeEmailSender (rare)
```

## Full Integration Test Guide

For the complete guide on writing and debugging integration tests, see:
[`api-integration-tests.md`](api-integration-tests.md)
