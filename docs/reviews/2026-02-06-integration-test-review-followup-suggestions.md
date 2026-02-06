# Follow-up Suggestions for Integration Test Infra (for Claude)

Date: 2026-02-06  
Context: Follow-up to `docs/reviews/2026-02-06-integration-test-infrastructure-review.md` and Claude’s response in `docs/reviews/2026-02-06-integration-test-review-response.md`.

This note is meant to be **easy to copy/paste** into the PR discussion and to clarify **intent** behind a few remaining suggestions. It contains **no required changes**, just recommended follow-ups and PR hygiene items.

## What I checked

- Skimmed Claude’s response doc and spot-checked the implementation in:
  - `apps/api/Src/Lib/Testing/TestEnvironment.cs`
  - `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs`
  - `apps/api/Src/Lib/Testing/ApiFixture.cs`
  - `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs`
  - `apps/api/Src/Lib/Testing/MainApiFactory.cs`
  - `apps/api/Src/Lib/Testing/TestAuthClient.cs`

## Summary (where things stand)

- The original “Request Changes” items are **mostly resolved well**:
  - init rollback is fixed
  - fixture dispose is resilient
  - cookie leakage risk is mitigated (`HandleCookies = false`)
  - `EnableSensitiveDataLogging()` removed
  - more parameterized SQL / better error messages
  - parallelization enabled by removing `[Collection("Database")]` and using a shared singleton container

The remaining items below are about **making failures more diagnosable** and **keeping the PR clean**.

---

## Suggestion 1: Add a fail-fast “seeding ran” verification (recommended)

### Intent

The `MigrateAsync()` + `EnsureCreatedAsync()` double-pass is acceptable **if and only if** we ensure that:
- seeding hooks actually executed, and
- the seed data contract that tests depend on is present.

Otherwise, failures show up later as confusing `400`/`401` test failures (login/permissions) rather than as “template seeding didn’t run”.

### Where

Add this immediately after:

```csharp
await dbContext.Database.EnsureCreatedAsync(ct);
```

in `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs` (inside `EnsureTemplateDatabaseAsync`).

### Suggested code

```csharp
// Fail fast if seeding didn't run (otherwise tests fail later with confusing 400s/401s).
var hasSeededStaffAdmin = await dbContext.User
  .IgnoreQueryFilters()
  .AnyAsync(u => u.Email == TestConstants.StaffAdminEmail, ct);

if (!hasSeededStaffAdmin) {
  throw new InvalidOperationException(
    "Template database seeding did not run (or seed/test data drifted). " +
    $"Expected seeded user '{TestConstants.StaffAdminEmail}' was not found. " +
    "If seeders changed, update TestConstants."
  );
}
```

### Notes

- `IgnoreQueryFilters()` avoids future false negatives if global query filters change.
- This check does not need to be “perfect”; it only needs to be “high signal” and stable.

---

## Suggestion 2: PR hygiene — exclude local/editor config changes

### Intent

Keep the PR focused on test infrastructure. Local machine config changes tend to be noisy, environment-specific, and conflict-prone.

### Recommended git commands (if these files accidentally get included)

```powershell
git restore --staged .claude/settings.local.json .mcp.json .vscode/settings.json
git restore .claude/settings.local.json .mcp.json .vscode/settings.json
```

Also, ensure `.worktrees/` is not included in the PR (delete locally or add to `.gitignore` if it’s a recurring artifact).

---

## Suggestion 3: Container failure-path cleanup (minor robustness)

### Intent

Ryuk usually handles cleanup, but if:
- container starts successfully, and then
- template init fails (migrations/seeding issue),
  
it’s helpful to **dispose the container immediately** (rather than relying on Ryuk/process-exit cleanup). This keeps repeated local runs cleaner and avoids leaving stray containers around if Ryuk is disabled.

### Where

In `apps/api/Src/Lib/Testing/PostgresContainerFixture.cs`, in the code path where template initialization can throw after the container has started.

### Suggested shape (pseudo-code)

```csharp
try {
  await _container.StartAsync();
  await manager.EnsureTemplateDatabaseAsync();
} catch {
  try { await _container.DisposeAsync(); } catch { /* best-effort */ }
  throw;
}
```

---

## Suggestion 4: Ensure infra files are actually tracked/staged (repo hygiene)

### Intent

When iterating quickly, it’s easy to end up with “untracked but required” infra files (or accidentally exclude a file the test project expects). This manifests as confusing compile errors on CI or on other machines.

### Recommended quick checks

```powershell
git status -sb
git diff --name-only --cached
```

Specifically confirm `apps/api/Src/Lib/Testing/DatabaseTemplateManager.cs` is included, since it is central to template/clone/drop behavior.

---

## Suggestion 5: Keep the “build status” claim precise (warnings vs errors)

### Intent

The response doc currently claims “0 warnings, 0 errors”. In practice, `dotnet test` / MSBuild can emit warnings that are not failures (e.g., transient copy warnings from the test host / `WebApplicationFactory` manifest generation).

To keep the doc trustworthy:
- either update the claim to “tests pass” (without asserting no warnings), or
- capture the exact command + output snippet, or
- fix/suppress the warnings if you truly want “0 warnings”.

### Recommended wording

Prefer:

> Build/test status: tests pass (`dotnet test ...`).

over:

> 0 warnings, 0 errors

unless you have a CI artifact proving it.
