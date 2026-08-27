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

## Paired Red/Green Proofs — keeping the red test alive (issue #1659)

In this repo, the **paired red-then-green proof** is the criterion that distinguishes a real test
from a decorative one. The red side is the harder half: a test that proves a bug *is* present
must, by construction, **fail** against the corrected code. Leaving it in the suite would make
the suite permanently red, so the historical pattern has been to capture the red, paste the output
into a trace, and **delete the test**. Issue #1659 names what that costs: a pasted output is not
replayable, so the reviewer either trusts the trace or rebuilds the test from scratch. PR #1651
got away with it because the case was small; a concurrency or rendering proof cannot be
reconstructed cheaply, and at that point the proof stops being reviewed at all.

This section is the convention. It is normative for any new paired proof produced in this repo.

### The form: keep the test, in a dedicated location, named by the trace

Three forms were considered (issue #1659 §"Ce qu'il faut"):

1. Keep the test **disabled** in the suite (`describe.skip` / `xfail` / `Skip`) with a comment
   naming the issue and the mutation.
2. **Transform** the test into a test of the correction, and document the mutation in a comment
   so a reviewer can re-apply it to replay the red.
3. Keep the test in a **dedicated location**, excluded from the current suite but runnable on
   demand.

This repo uses **form (3)**. Rationale:

- Form (1) leaves a red test in the suite, with its re-activation requiring both an edit and a
  reviewer re-reading the comment for the mutation. That is a real cost; on a small proof, the
  saving over form (3) is one `git worktree add` and one `vitest run <path>`.
- Form (2) breaks the issue's demand that the reviewer obtain the **red** in one manipulation.
  "Read the comment, apply this patch, run the test, revert" is two manipulations and a re-derivation
  of the mutation; the test that the reviewer runs is no longer the same file that produced the
  original red.
- Form (3) keeps the test executable as-is and keeps the suite green. The reviewer does:

  ```
  # from the branch that produced the proof, in the worktree that has .dump/
  pnpm --filter front exec vitest run --config vitest.preuves.config.ts \
      .dump/preuves/<issue>/<name>.test.ts
  ```

  The test runs the same source that produced the original red; the failure message is the
  same; no edit, no patch, no re-derivation.

### Where the test lives

```
apps/front/.dump/preuves/<issue-number>/<descriptive-name>.test.ts   # front
.dump/preuves/<issue-number>/<descriptive-name>.Spec.cs              # api
```

- The path under `.dump/` is **git-ignored** (see `.gitignore`), so the test does not pollute
  the suite and does not have to be maintained as production code.
- The file name carries the issue number and a short, hyphen-separated name (`red-1613-negligent-caller-no-reset`).
- The file is **executable as-is**: real `import` statements, real assertions, no placeholder
  boilerplate. A reviewer who runs it must obtain the same red output the author did, on the
  same code state.
- Front preuves MUST live under `apps/front/.dump/preuves/`, not the repo-root `.dump/`. The
  front vitest config's `include` pattern (`src/**`) and module resolution require the test to
  be inside the vitest root (`apps/front/`) for vite to resolve `react` and the production
  imports. The default `vitest.config.ts` excludes `.dump/`; the companion
  `vitest.preuves.config.ts` adds it back so the red test can be replayed on demand.

### What the trace must contain

Every paired-proof trace (the `.dump/preuve-<issue>.md` file the lane already produces) MUST,
in addition to the red and green outputs, name:

- the **kept red test** by its path under `.dump/preuves/<issue>/`,
- the **mutation** that produces the red (the exact code change applied to the production code,
  including the line and the diff), so a reviewer who cannot reach `.dump/` can re-apply it
  against the current code state, and
- the **green run** command and the summary line (`Tests N passed / N total`) for the
  corrected state.

A trace that does not name the kept red test is incomplete: a pasted output without a path
cannot be replayed, which is exactly the failure mode #1659 names.

### Replaying the proof from a detached worktree

A reviewer working in a detached worktree does **not** see `.dump/` — it is git-ignored and
never pushed. The convention is:

1. Fetch the lane branch (`git fetch origin lane/wt-<issue>`), then check it out into a
   worktree of the lane that produced the proof. The `.dump/` files of that branch are present
   in that worktree because they live in the branch's working tree, not in its tree-ish.
2. If the reviewer cannot or will not check out the lane (they only have `develop`), the trace
   MUST be self-sufficient: it must name the kept red test's path, the mutation to apply, and
   the expected failure message, so the reviewer can reproduce the red by hand against the
   current code.

The second path is the failure mode the issue warns about. The convention prevents it by
**requiring** the trace to carry the mutation — not by versioning `.dump/`.

### When this convention does not apply

A paired red/green proof is required for **bug fixes** and **guard rails** (a guard that
turns red when a forbidden pattern is reintroduced; a regression test that pins a known loss).
It is **not** required for:

- pure refactors with no behavior change;
- new features that do not regress an existing behavior;
- doc-only and config-only changes.

A guard rail produced without a paired red proof is vacuous and will be rejected in review
regardless of this convention.

### Why no automated guard (yet)

Issue #1659 explicitly asks whether to add a CI guard that refuses a PR whose trace cites a
deleted test. We considered three and rejected all of them at this stage:

- A guard that scans `.dump/` traces for test paths and verifies the file exists would never
  fire: by the convention's own design, the kept test lives in `.dump/`, which is git-ignored
  and never reaches CI.
- A guard that requires the test path to exist in the suite contradicts the convention: the
  whole point is that the red test is **excluded** from the suite.
- A guard that asks the PR body to declare the kept-test path and the mutation is feasible
  but premature: it would add a new required section to every PR body for a problem we have
  not yet seen at scale. The first wave is "convention, written and applied"; the second
  wave, after we have a few examples in `.dump/preuves/`, can decide whether the convention
  is reliably followed enough to enforce.

The convention is the right first step. If a future lane produces a paired proof without a
kept red test, the right response is a review comment naming this section, not a CI failure.

### Worked example: #1613 / #1651 (negligent caller of `useOffsetPageClamp`)

The red test that PR #1651 deleted is kept at
`apps/front/.dump/preuves/1613/red-1613-negligent-caller-no-reset.test.ts` in this branch,
with the mutation and the red/green transcripts in
`apps/front/.dump/preuve-1613-convention.md`. A reviewer replays the red by checking out
this branch and running:

```
pnpm --filter front exec vitest run --config vitest.preuves.config.ts \
    .dump/preuves/1613/red-1613-negligent-caller-no-reset.test.ts
```

This is the first application of the convention; it is the only case the present branch
converts. Other past proofs in the repo are out of scope for #1659 by design (see
"Anything in this brief that turned out to be wrong" in the PR body).
