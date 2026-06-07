# Spike: Spec-Naming Convention Self-Guard Feasibility

**Issue:** #536 (sub-issue of #357)
**Date:** 2026-06-07
**Author:** spike/536-spec-naming-guard
**Decision needed:** GO / NO-GO on automating the two test-naming conventions as an executable guard

---

## Convention Summary (from `docs/guides/test-conventions.md`)

| Convention | Rule |
|---|---|
| **File naming** | Every test file must end in `.Spec.cs` |
| **Method naming** | Every `[Fact]`/`[Theory]` method must follow `ItShould{Expected}When{Scenario}` — starts with `ItShould`, contains `When`, no underscores |

No documented exceptions exist in `test-conventions.md` for either rule. The guide provides
representative examples (`ItShouldReturnOkWithValidData`, `ItShouldReturnUnauthorizedWithoutAuth`)
but does not carve out escape hatches for Theory data rows, arch-guard vacuity checks, or
short-scenario methods.

---

## A. Filename Drift

Scan: all `.cs` files under `apps/api/` and `packages/lint-cs/` that contain at least one
`[Fact]` or `[Theory]` attribute, but whose filename does NOT end in `.Spec.cs`.

**Result: 0 offenders.**

All 109 `*.Spec.cs` files in the repo carry the correct suffix. The filename convention is
already 100% clean; no guard is needed to remediate existing drift on this dimension.

---

## B. Method-Name Drift

Scan: all `*.Spec.cs` files (109 total), every `[Fact]`/`[Theory]` method whose name does
NOT match `^ItShould\w+When\w+$`.

**Total `[Fact]`/`[Theory]` methods found: 467**
**Raw non-conforming count: 229** (49% of the corpus)

### Classification

| Category | Count | Verdict |
|---|---|---|
| `FACT_MISSING_WHEN` — `[Fact]` methods starting with `ItShould` but missing `When` | 164 | **Genuine violation** |
| `DEFENSIBLE_NO_WHEN` — methods starting with `ItShould` + a verb-phrase that is self-evident without `When` (Expose/Discover/Include/Exclude/Keep/Publish/Use/Report/Name/Order/Reject/Not/Require/Target/List/Treat/Sort) | 65 | **Defensible exception** |

**Genuine violation count: 164**
**Defensible exception count: 65**

> Note: zero methods fall into the `NO_ITSHOULD` category (not starting with `ItShould`) and zero `[Theory]`
> methods are non-conforming — all non-conforming methods are `[Fact]`.

### Representative sample (~10 genuine violations)

These are production handler tests that skip `When`, making the scenario implicit:

```
ItShouldReturnOk                             Health.Spec.cs:23
ItShouldConvertToUtc                         DateUtils.Spec.cs:34
ItShouldReturnUnauthorizedWithoutSession     GetStaffUserProfiles.Spec.cs:43
ItShouldReturnForbiddenForNonStaffUser       GetStaffUserProfiles.Spec.cs:54
ItShouldReturnForbiddenForStaffWithoutPermission  GetStaffUserProfiles.Spec.cs:70
ItShouldReturnBadRequestForMalformedId       GetStaffUserProfiles.Spec.cs:93
ItShouldReturnNotFoundForNonExistentId       GetStaffUserProfiles.Spec.cs:112
ItShouldSuspendActiveTenantUser              SuspendTenantUserAsStaff.Spec.cs:42
ItShouldSoftDeleteSuspendedStaffUserAndHideThemFromAllStaffSurfaces  DeleteStaffUser.Spec.cs:100
ItShouldReturnValidationProblemForMalformedBulkDeleteBody  BulkDeleteStaffUsers.Spec.cs:105
```

Most violations are structurally clear (`ItShouldReturnUnauthorizedWithoutSession`) — the
"When" is semantically embedded in the `Without`/`For` phrase, but syntactically absent.
A strict regex guard would fire on all 164.

### Defensible exceptions — sample

These are arch-guard vacuity checks and metadata assertions where "When" would be forced
and unnatural:

```
ItShouldDiscoverHandlerEntrypointsToGuard    HandlerContractGuard.Spec.cs:49
ItShouldExposeCoalesceThrowDiagnosticMetadata CoalesceThrowAnalyzer.Spec.cs:338
ItShouldExcludeEfMigrationTypes             ArchitectureDiscovery.Spec.cs:32
ItShouldKeepAllowlistEntriesRelevant        ServiceArgsRecordConvention.Spec.cs:108
ItShouldPublishSnakeCaseQueryParameterNames  OpenApiContract.Spec.cs:22
```

---

## C. Approaches

### Approach 1 — Reflection-based xUnit test (architecture test in `Lib/Architecture/`)

**How it works:** A `TestNamingGuard.Spec.cs` scans the test assembly via reflection, enumerates
methods decorated with `[Fact]`/`[Theory]`, and asserts names match the required regex.

**Filename check?** No. Reflection sees types/methods, not file paths. The file-naming convention
cannot be enforced this way.

**Code sketch:**

```csharp
// Lib/Architecture/TestNamingGuard.Spec.cs
[Fact]
public void ItShouldNameTestMethodsWithItShouldAndWhenWhenNoScenarioException() {
    var testAssembly = typeof(TestNamingGuardSpec).Assembly;
    var offenders = (
        from type in testAssembly.GetTypes()
        from method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance)
        where method.GetCustomAttribute<FactAttribute>() is not null
           || method.GetCustomAttribute<TheoryAttribute>() is not null
        where !Regex.IsMatch(method.Name, @"^ItShould\w+When\w+$")
        // allowlist needed immediately for 65 defensible names + 164 genuine violations
        where !AllowedMethods.Contains(method.Name)
        select $"{type.Name}.{method.Name}"
    ).ToList();
    offenders.Should().BeEmpty(because: "...");
}
```

**Tradeoffs:**

- `+` Zero new toolchain dependencies; runs in the existing test suite without Docker.
- `+` Exact same pattern as the existing `HandlerContractGuard`, `RouteConstraintGuard`, etc.
- `+` Can use the baseline-then-ratchet pattern already established in the repo.
- `-` Cannot enforce the file-naming convention (filename not available at reflection time).
- `-` Must ship with a 229-entry allowlist on day 1 (164 genuine + 65 defensible); ratcheting
  to zero on genuine violations alone is 164 methods across 70+ files.
- `-` `[Theory]` methods' scenario context lives in `[InlineData]`/`[MemberData]`; a strict name
  check can fire on theories where the name is deliberately data-agnostic. However, no Theory
  violations exist in the current corpus.
- `-` Method-level rename churn to reach zero is high (164 methods, each requiring a meaningful
  "When" clause to be invented, not just appended).

### Approach 2 — Roslyn analyzer (new `PUBLY0009` / `PUBLY0010` pair)

**How it works:** A `DiagnosticAnalyzer` registers `SyntaxKind.MethodDeclaration`. For each
method, check (a) whether it has `[Fact]`/`[Theory]` attributes and (b) whether the declaring
file's path ends in `.Spec.cs` and the method name matches the required pattern.

**Filename check?** Yes. The syntax tree's `SyntaxTree.FilePath` property is available in
`SyntaxNodeAnalysisContext`. A file-naming rule is a separate `RegisterSyntaxTreeAction`.

**Code sketch:**

```csharp
// PUBLY0009 — file naming
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class SpecFileNamingAnalyzer : DiagnosticAnalyzer {
    public override void Initialize(AnalysisContext ctx) {
        ctx.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        ctx.EnableConcurrentExecution();
        ctx.RegisterSyntaxTreeAction(tree => {
            var filePath = tree.Tree.FilePath;
            // Check: any [Fact]/[Theory] present + file not *.Spec.cs
            var hasTestAttr = tree.Tree.GetRoot().DescendantNodes()
                .OfType<AttributeSyntax>()
                .Any(a => a.Name.ToString() is "Fact" or "Theory");
            if (hasTestAttr && !filePath.EndsWith(".Spec.cs", StringComparison.Ordinal)) {
                ctx.ReportDiagnostic(Diagnostic.Create(
                    DiagnosticCatalog.SpecFileNaming, Location.None,
                    System.IO.Path.GetFileName(filePath)));
            }
        });
    }
}

// PUBLY0010 — method naming
ctx.RegisterSyntaxNodeAction(ctx => {
    var method = (MethodDeclarationSyntax)ctx.Node;
    bool hasTestAttr = method.AttributeLists
        .SelectMany(al => al.Attributes)
        .Any(a => a.Name.ToString() is "Fact" or "Theory");
    if (!hasTestAttr) return;
    var name = method.Identifier.Text;
    if (!Regex.IsMatch(name, @"^ItShould\w+When\w+$")) {
        ctx.ReportDiagnostic(Diagnostic.Create(
            DiagnosticCatalog.SpecMethodNaming, method.Identifier.GetLocation(), name));
    }
}, SyntaxKind.MethodDeclaration);
```

**Tradeoffs:**

- `+` Can enforce BOTH conventions (filename + method name).
- `+` IDE feedback at edit time; no test run required.
- `+` Syntactic only — no semantic model needed for either rule; fast.
- `-` Requires registering new diagnostic IDs (`PUBLY0009`, `PUBLY0010`), entries in
  `DiagnosticIds.cs`, `DiagnosticCatalog.cs`, and `AnalyzerReleases.Unshipped.md` — non-trivial
  boilerplate.
- `-` Method naming fires on 229 sites immediately (164 genuine + 65 defensible). The
  `.editorconfig` suppression or a structured `#pragma warning disable` pattern is required for
  each defensible name; that alone is 65 suppressions across many files.
- `-` False-positive risk: arch-guard vacuity checks (`ItShouldDiscoverX`, `ItShouldExposeX`)
  read as clean to humans but violate `When` strictly. These are 65 hard-coded suppressions or
  require a regex exception in the analyzer.
- `-` Maintenance: every new arch-guard vacuity method needs a suppression or the regex broadened.

### Approach 3 — Source generator

**Why it's a poor fit:** Source generators produce new code; they do not flag problems in existing
code. Generators cannot emit `DiagnosticDescriptor` diagnostics against the user's source tree in
the same way analyzers do (the `GeneratorExecutionContext.ReportDiagnostic` API is available but
limited to source-level problems found by the generator, not general naming audits). A source
generator that self-referentially scans the project for test methods and emits a failing compilation
unit is a Rube Goldberg machine for what is naturally a Roslyn analyzer or arch-test concern.
**Verdict: not applicable.**

---

## D. Sample Diagnostics

**PUBLY0009 (file naming) — hypothetical:**
```
warning PUBLY0009: File 'PasswordLogin.cs' contains [Fact]/[Theory] methods
  but is not named '*.Spec.cs'. Rename to 'PasswordLogin.Spec.cs'.
```
_(No actual violations currently; included for illustration.)_

**PUBLY0010 (method naming) — on existing violations:**
```
warning PUBLY0010: Test method 'ItShouldReturnOk' does not follow the
  'ItShould{Expected}When{Scenario}' convention. Add a 'When...' clause
  to name the scenario, e.g. 'ItShouldReturnOkWhenServiceIsHealthy'.
  [Health.Spec.cs:23]

warning PUBLY0010: Test method 'ItShouldConvertToUtc' does not follow the
  'ItShould{Expected}When{Scenario}' convention. Rename to include a scenario
  clause, e.g. 'ItShouldConvertToUtcWhenDateTimeOffsetIsProvided'.
  [DateUtils.Spec.cs:34]

warning PUBLY0010: Test method 'ItShouldDiscoverHandlerEntrypointsToGuard' does not follow
  the 'ItShould{Expected}When{Scenario}' convention. (This is a vacuity check; suppress
  with #pragma warning disable PUBLY0010 if the guard has no meaningful 'When' clause.)
  [HandlerContractGuard.Spec.cs:49]
```

---

## E. GO / NO-GO Recommendation

### Threshold (from issue #536)

> "If the approach requires source parsing or produces noise > 20 sites, drop and rely on reviewer enforcement."

### Verdict: NO-GO

**Drift vs threshold:**

| Convention | Drift | Threshold | Result |
|---|---|---|---|
| File naming (`*.Spec.cs`) | **0 violations** | 20 | N/A — already clean |
| Method naming (`ItShould…When…`) | **229 raw / 164 genuine** | 20 | **8x over threshold** |

**Rationale:**

1. **File naming is already clean.** 109/109 files comply. No guard needed; the convention is self-enforcing through code review.

2. **Method naming has massive existing drift.** 164 genuine violations (methods whose `When`-clause is embedded in human-readable but non-regex-conformant phrasing such as `ItShouldReturnUnauthorizedWithoutSession`) and 65 more defensible exceptions (arch-guard vacuity checks, metadata assertions). Together they exceed the 20-site noise threshold by 11x.

3. **The "genuine" violations are not bugs.** Names like `ItShouldReturnForbiddenForNonStaffUser` are semantically clear; the only problem is the absence of a literal `When` token. Renaming 164 methods to insert `When` would produce churn with no observability benefit.

4. **Defensible exceptions create lasting maintenance cost.** The 65 arch-guard methods (e.g. `ItShouldDiscoverHandlerEntrypointsToGuard`) need either permanent suppression attributes or a growing regex allowlist inside the analyzer — adding friction to every new guard added in future.

5. **Approach 1 (reflection) cannot cover file naming** and would require a 229-entry allowlist. Approach 2 (Roslyn) covers both conventions but fires on 229 sites and demands 65 ongoing suppressions.

**Recommended action:** Continue relying on PR reviewer enforcement for method naming. Consider
refining the documented convention to acknowledge that `Without`, `For`, and similar prepositions
embedded in the `Expected` clause serve the same disambiguating function as an explicit `When`,
reducing future false positives if an automated check is revisited after the corpus is ratcheted
(e.g. during a focused naming cleanup sprint). File naming needs no action — it is already 100%
compliant.

**If Radan decides to proceed anyway:** Approach 1 (reflection-based arch test) is lower overhead
than a Roslyn analyzer for the method-name half. Ship it with the baseline-then-ratchet pattern,
starting from the 164 genuine violations allowlisted and targeting zero by a defined date.
The file-naming half can be a one-line `find` check in CI instead of a Roslyn analyzer (zero drift today → run `find apps packages -name "*.cs" -not -name "*.Spec.cs" ...` in a CI step).
