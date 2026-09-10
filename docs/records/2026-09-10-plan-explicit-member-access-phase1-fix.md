# Explicit C# Member Access Phase 1 Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct PUBLY0012 semantic eligibility, provider revalidation, and AppHost analyzer-only wiring while recording the approved Phase 1 bespoke-guard exception and proving document/project/solution Fix All behavior.

**Architecture:** Keep one shared `ExplicitMemberAccessHelper` as the analyzer and code-fix eligibility boundary. It will reject generated documents, direct designator syntax, unsupported or ambiguous bindings, and any replacement whose speculative symbol set differs from the original. The analyzer remains dormant by descriptor and the test-only editorconfig enables it.

**Tech Stack:** C#/.NET 10, Roslyn analyzers and Workspaces, Microsoft.CodeAnalysis CSharp testing, xUnit, Aspire AppHost MSBuild metadata, Markdown catalog/specification.

### Phase 2 carry-forward TODO

Phase 1 is detection-only. Move the PUBLY0012 code-fix provider and its
Workspaces dependency to Phase 2 in a separate code-fix assembly that follows
Roslyn's RS1038 analyzer/code-fix separation. Keep Workspaces out of
`packages/lint-cs/PublyApp.Analyzers.csproj`; the Phase 1 test-harness-only
reference is allowed and is pinned centrally at 5.0.0. The removed provider and
its 11 code-fix tests last existed at
`d043eb9d18c6af7c6ed5e3805e6b7230c653ead4`.

---

### Task 1: Establish RED coverage for semantic regressions

**Files:**
- Modify: `packages/lint-cs/ExplicitMemberAccessAnalyzer.Spec.cs`

- [ ] Add failing analyzer/code-fix cases for initializer value assignment and property-pattern constant values, valid overloaded instance/static method groups, generic/`nameof`/delegate method groups, and ambiguous invocation no-fix boundaries. Change the existing initializer test to expect diagnostics for value expressions while keeping direct designators clean.
- [ ] Add failing direct-provider tests for migration paths, generated filename/header/attribute documents, and preserve the `Migrations/*.Spec.cs` exception.
- [ ] Run the focused analyzer test project and verify the new tests fail for the current implementation with the expected missing diagnostics/actions.

### Task 2: Implement shared semantic eligibility and replacement equivalence

**Files:**
- Modify: `packages/lint-cs/ExplicitMemberAccess.cs`
- Modify: `packages/lint-cs/ExplicitMemberAccessCodeFixProvider.cs`

- [ ] Move repository-generated exclusion into `TryGetInfo`, and use direct parent syntax checks for initializer and property-pattern designators.
- [ ] Accept non-empty `CandidateSymbols` method groups only when every candidate is a supported current-hierarchy member with one staticness, then require the qualified speculative binding to reproduce the exact symbol set.
- [ ] Keep unresolved, mixed-staticness, unsupported, and ambiguous bindings ineligible; make the provider rely on the same helper and diagnostic span.
- [ ] Run the focused analyzer tests and confirm the Task 1 tests pass.

### Task 3: Add missing boundary and Fix All proof

**Files:**
- Modify: `packages/lint-cs/ExplicitMemberAccessAnalyzer.Spec.cs`

- [ ] Add interface/inherited-member, alias/ambiguity fallback, conditional-access, and generated-boundary coverage where absent.
- [ ] Add real `BatchFixedCode` coverage with multiple documents in one project and multiple projects in one solution, including safe and unsafe documents, exact trivia, only-PUBLY0012 changes, and a second analyzer pass with no diagnostics.
- [ ] Run the full focused analyzer test project and record the resulting count.

### Task 4: Correct AppHost analyzer-only metadata

**Files:**
- Modify: `apps/apphost/PublyApp.AppHost.csproj`

- [ ] Set `IsAspireProjectResource="false"` on the analyzer-only project reference without changing analyzer input or adding an API-test analyzer reference.
- [ ] Build AppHost in the focused configuration and inspect generated metadata to prove zero ASPIRE004 and no analyzer project resource metadata.

### Task 5: Ratify Phase 1 governance and catalog documentation

**Files:**
- Modify: `docs/records/2026-09-09-spec-explicit-csharp-member-access.md`
- Modify: `docs/guides/lint-rules.md`

- [ ] Change the design status to ratified/approved and add the dated 2026-09-10 owner-approved bespoke-guard admission exception, dormant-until-Phase-2 statement, and retirement/rollback condition.
- [ ] Add PUBLY0012 to the lint catalog as `PublyApp.Style`, dormant/Phase-1, with a note pointing to the recorded exception.
- [ ] Leave `docs/guides/test-conventions.md`, root `.editorconfig`, generated code, migrations, ruleset, and API-test analyzer wiring unchanged.

### Task 6: Verify, mutate, report, and commit

**Files:**
- Create: `/home/radan/.hermes/orchestration/runs/publyapp-2026-09-06-captain/issue-2111-phase1-luna-fix-report.md`

- [ ] Run the requested focused tests, focused Release/Debug/Test builds, `dotnet format --verify-no-changes`, `npx oxlint` for changed JS/TS files if any, and `git diff --check`; do not run heavy product/API/E2E suites.
- [ ] Perform and restore the instance receiver, static receiver, initializer, and method-group mutations, capturing exact RED transcripts.
- [ ] Verify no analyzer DLL enters API/AppHost/Scripts runtime output and record exact command output, final HEAD, file/line summaries, documentation changes, and any impossible or incorrect brief items.
- [ ] Commit the implementation and documentation changes as normal commits on the current branch; do not push, merge, or open a PR.
