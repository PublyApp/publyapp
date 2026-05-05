# Test Conventions

> Extracted from `AGENTS.md` — testing conventions for the PublyApp API.

## Test File Naming

- Spec files use `*.Spec.cs` suffix (not `*.IntegrationTests.cs`)
- Class name = `{Feature}Spec` (e.g., `CreateSystemNoticeSpec`, `PasswordLoginSpec`)
- Co-located next to the handler/source they test
- Unit test specs co-locate next to their source file (e.g., `DateUtils.Spec.cs` next to `DateUtils.cs`)

## Test Method Naming (BDD)

- Use `ItShould{Expected}When{Scenario}` format
- Always start with `ItShould`
- No underscores in method names
- Examples: `ItShouldReturnOkWithValidData`, `ItShouldReturnUnauthorizedWithoutAuth`, `ItShouldReturn403ForNonMember`

## Testing/ Folder Structure

Test infrastructure lives in `Src/Lib/Testing/` organized by purpose:

- `Testing/Fixtures/` — test environment setup (`ApiFixture`, `MainApiFactory`, `PostgresContainerFixture`, `DatabaseTemplateManager`, `TestEnvironment`, `TestConstants`)
- `Testing/Helpers/` — test utility methods (`TestAuthClient`, `TenantTestHelper`, `SystemNoticeTestHelper`, `HttpRequestMessageExtensions`)
- `Testing/Fakes/` — test doubles (`FakeEmailSender`)
- NO test cases in Testing/ — specs live co-located with source

## Architecture Tests

Architecture tests enforce cross-cutting rules across the entire assembly (not testing a specific class). They follow the same conventions but live in `Src/Lib/Architecture/`:

- Use `*.Spec.cs` suffix (e.g., `ArchitectureGuard.Spec.cs`)
- Namespace: `MainApi.Src.Lib.Architecture`
- Tests scan the assembly to verify architectural compliance
- Example: `ArchitectureGuard.Spec.cs` ensures `PatchField<T>` doesn't appear in HTTP DTOs

## Test Using Statements

Spec files reference test infrastructure via sub-namespaces:

```csharp
using MainApi.Src.Lib.Testing.Fixtures;  // ApiFixture, TestConstants
using MainApi.Src.Lib.Testing.Helpers;    // TestAuthClient, TenantTestHelper
using MainApi.Src.Lib.Testing.Fakes;      // FakeEmailSender (rare)
```

## Full Integration Test Guide

For the complete guide on writing and debugging integration tests, see:
[`api-integration-tests.md`](api-integration-tests.md)
