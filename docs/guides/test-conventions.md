# Test Conventions

> Extracted from `AGENTS.md` — testing and executable-guard conventions for PublyApp.

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
- The shared reflection helper, `Lib/Architecture/ArchitectureDiscovery`,
  enumerates handler types, HTTP wire DTO records, service types, and route
  constants while excluding generated/build artifacts. Admitted backend reflection
  guards reuse it rather than re-scanning the assembly ad hoc.
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

### Bespoke guard admission (hard rule)

A bespoke guard is an executable assertion whose primary purpose is to police a repository-specific
policy or convention. Examples include a source scanner, reference snapshot, ratchet, manifest
verifier, architecture scan, custom compiler/linter extension, or meta-guard.

The admission unit is a **new executable policy assertion**, not a new file. Adding a new forbidden
condition, matcher, protected inventory, reference rule, ratchet, or materially broader scope to an
existing guard counts as new. Renaming or mechanically refactoring an existing guard without
changing its decisions does not. Neither does fixing it so it once again enforces its already
documented scope, adding fixtures for that scope, or adding expected data to an existing closed
inventory without changing the policy.

Ordinary behavioural tests are not bespoke guards, whether they exercise product code, repository
tooling, generators, deployment scripts, migrations, or an admitted guard's implementation. Directly
enabling or configuring an existing off-the-shelf compiler, linter, security scanner, schema
validator, or similar tool is also not bespoke. A repository-specific wrapper or policy layer around
that tool is bespoke.

New executable policy assertions are **forbidden by default**. A proposing PR must prove every
condition below; missing one condition means the assertion is rejected:

1. A current, reproducible failure demonstrates the problem. A hypothetical risk is not evidence.
2. The guard protects a critical security, data-integrity, public-contract, build, or release
   invariant. A style preference or isolated low-impact mistake is not enough.
3. An ordinary behavioural/unit/integration test, type system, or direct use of an existing standard
   tool cannot cover the invariant more simply.
4. The proposed implementation is the smallest viable mechanism. Any parser, snapshot, manifest,
   allowlist, or ratchet must be indispensable to that mechanism, have one source of truth, and
   carry an explicit maintenance cost in the proposal. A guard-of-a-guard is never admissible.
5. The PR contains a reproducible red/green proof: the defect escapes before the guard and is
   caught after it.
6. The PR names the concrete condition that will retire the guard or replace it with a standard
   tool. A guard with no retirement condition is permanent maintenance debt and is rejected.

A PR introduces a guard gap when its changed product/tooling surface escapes coverage that the
existing guard's documented policy requires, even if the new instance is currently conforming; when
that surface already violates the policy; or when its guard change creates a new bypass. The PR must
bring the changed surface under the existing coverage, fix the violation, or drop the change that
created the gap before merge. It must not create a follow-up guard-gap issue. Merely discovering an
independently reproducible pre-existing gap is not "introducing" it. Such a gap gets a separate issue
only when its product, security, data, contract, build, or release impact is material. This
restriction does not apply to ordinary non-guard follow-ups.

Reviewers enforce this admission rule directly. Do not add a script, analyzer, manifest, snapshot,
or meta-guard to enforce the admission rule itself.

If and only if a guard is admitted:

1. Put it in the narrowest existing tool surface that owns the invariant; do not create a new guard
   framework for it.
2. Add focused tests with both a violating case and a conforming case. Tests assert behaviour; they
   do not need admission of their own.
3. Make failures name the concrete offender and required correction.
4. Fail loudly on an empty, unknown, or unparseable scan rather than passing vacuously.
5. Fix every current violation in the same PR. Do not use a baseline, allowlist, or ratchet merely to
   stage adoption. If cleanup cannot land safely in that PR, do not ship the guard yet.
6. Keep admission evidence technology-neutral: the PR records the exact command and either a
   violating fixture or a temporary mutation that the candidate catches, plus the conforming/restored
   green run. A real-tree mutation is restored before commit; no new permanent proof framework is
   required. This admission evidence is not the kept-red paired bug proof defined below.

For an admitted backend reflection guard specifically, add a `*.Spec.cs` under
`apps/api/Lib/Architecture/`, use `ArchitectureDiscovery` for shared discovery, and keep the
namespace `PublyApp.Api.Lib.Architecture`. Other guard categories follow their existing tool's
co-located test convention; they do not imitate the C# layout.

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

When a PR claims a **paired red-then-green proof**, that proof distinguishes a regression test
that catches the stated defect from a decorative one. The red side is the harder half: a test that
proves a bug *is* present
must, by construction, **fail** against the corrected code. Leaving it in the suite would make
the suite permanently red, so the historical pattern has been to capture the red, paste the output
into a trace, and **delete the test**. Issue #1659 names what that costs: a pasted output is not
replayable, so the reviewer either trusts the trace or rebuilds the test from scratch. PR #1651
got away with it because the case was small; a concurrency or rendering proof cannot be
reconstructed cheaply, and at that point the proof stops being reviewed at all.

This section is normative for a new **paired bug/regression proof** declared under the supported
front path below, and documents the legacy API trace form. It does not require every bug fix in every
repository surface to create a kept-red proof: no repo-wide runner or location exists for other
surfaces. Those changes use ordinary regression tests and review evidence. A bespoke guard's
admission evidence follows the technology-neutral fixture/mutation rule above and does not create a
kept-red test unless the PR separately declares a supported paired bug/regression proof.

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
  # from the branch that produced the proof
  cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
      tests/proofs/<issue>/<name>.test.ts
  ```

  The test runs the same source that produced the original red; the failure message is the
  same; no edit, no patch, no re-derivation.

### Where the test lives

```
apps/front/tests/proofs/<issue-number>/<descriptive-name>.test.ts   # front
.dump/preuves/<issue-number>/<descriptive-name>.Spec.cs              # api (legacy)
```

- Front preuve proof tests live under the **versionned** directory `apps/front/tests/proofs/<issue>/`.
  These files are committed to the repo (not git-ignored), so CI can always see them on a clean
  checkout. A PR declares a paired red proof by adding or modifying a file under that directory;
  the CI step `Verify paired red proofs` uses `git diff` to detect declared proofs and replays
  only those. If none are declared, the step prints an explicit no-op message and exits 0.
- Every declared front proof test MUST carry a sibling per-test expectation manifest named
  `<proof-file>.expected-red.json`, shaped per `apps/front/tests/proofs/expected-red.schema.json`.
  See `apps/front/tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts.expected-red.json`
  for a reference. Each entry under `expectedRed` MUST declare a non-empty `testName` (matched
  against vitest's reported test name by equality or suffix) and a non-empty `why` (the
  justification for why that test must fail). Add the manifest when you add a proof test; update
  it only when the declared test names or reasons change — an already-correct manifest untouched
  by the edit needs no mechanical bump. A missing, malformed, unreadable, or otherwise invalid
  manifest fails CI, as does a declared kept-red test that unexpectedly passes on the current code
  — see "What the CI guard checks" below.
- API preuve traces continue to use `.dump/preuves/<issue>/` (the API proof convention is legacy
  and not part of the #1659 front-side fix).
- The file name carries the issue number and a short, hyphen-separated name (`red-1613-negligent-caller-no-reset`).
- The file is **executable as-is**: real `import` statements, real assertions, no placeholder
  boilerplate. A reviewer who runs it must obtain the same red output the author did, on the
  same code state.
- Front proof tests MUST live under `apps/front/tests/proofs/`, not `.dump/`. The front vitest
  config's `include` patterns and module resolution require the test to be inside the vitest
  root (`apps/front/`) for vite to resolve `react` and the production imports. The default
  `vitest.config.ts` excludes `tests/proofs/**` so red tests never leak into the green suite; the
  companion `vitest.proofs.config.ts` adds them back so the red test can be replayed on demand.

### What the committed front proof record must contain

For **front** proofs, the committed proof docblock and its sibling
`<proof-file>.expected-red.json` manifest are the durable record. No tracked front source, test,
or documentation may point to a local git-ignored `.dump` trace as the proof's source of truth.
A local `.dump` file may be optional review scratch, but it is never required for replay and must
not be the only place where the evidence exists.

Together, the committed docblock and manifest MUST carry:

- the **replay** command and the kept-red test path under `apps/front/tests/proofs/<issue>/`,
- the **exact current expected failure** text (for example,
  `AssertionError: expected false to be true // Object.is equality`), without requiring the
  runner to match that display text,
- the primary **mutation** that produces the red, including the production assertion or behavior
  it changes,
- at least three **adverse-mutation attempts** against a different mechanism, naming the exact
  red test(s) that rejected each attempt or declaring a surviving mutation invalid, and
- the **green run** command plus its summary line (`Tests N passed / N total`) for the corrected
  state.

This is a lean documentation requirement, not a new scanner, guard, or meta-guard. The proof
runner continues to validate only the replayable test and its `expectedRed` entries.

The **API** convention remains legacy and separate: API preuve traces continue to use
`.dump/preuves/<issue>/` and retain the existing trace requirements. The front no-local-trace rule
does not rewrite that API scope.

### Mutation adverse — the committed proof record must survive an alternate fix

The paired red proof distinguishes a real test from a decorative one, but only if the
red test is **sensitive to the defect it claims to catch** — not to a coincidence
of the author's chosen mutation. A test that asserts on a symptom a mutation happens
to touch is not actually guarding the defect; a different mutation that does not
touch that symptom will keep the suite green, and the bug survives undetected.

This was demonstrated concretely on PR #1683: three alternate mutations
(`UNKNOWN_SEGMENT`→`DUAL_PATH`, `PARSE_ERROR`→`DUAL_PATH`, and replacing all
values) each kept the full 24-test suite green, because the tests asserted on the
error message text rather than the classification field, and production code never
read that field. **The convention as previously written would have accepted that
flawed PR as a valid proof.**

The committed front proof record MUST therefore include, alongside the primary mutation. For the
legacy API form, the same evidence remains in its `.dump/preuves/<issue>/` trace:

1. **A mutation adverse search** — an attempt to find a change that restores the
   defect (re-introduces the bug) while keeping the red test green. The goal is to
   break the proof's grip on the author's specific mutation: if the test only goes
   red because of the exact line the author changed, it is not actually testing the
   behavior it claims to test.

2. **A second mechanism** — the adverse mutation must attack a different axis than
   the primary mutation. If the primary mutation changes a default value, the
   adverse attempt must change what is asserted (e.g. message text instead of a
   classification field). If the primary mutation changes a condition, the adverse
   attempt must change a value the assertion ignores. Do not hunt for a variant of
   the same mutation.

3. **A declaration of the search result** — if a surviving mutation is found (one
   that restores the defect while keeping the red test green), the proof is
   **invalid**: the test does not actually guard the defect, and the committed record must
   say so. If no surviving mutation is found, the committed front record MUST record the at least
   three adverse mutations attempted and why each failed to keep the red test
   green ("I tried X, Y, Z; X was caught because the test asserts on field F which
   X modifies, Y was caught because the test exercises path P which Y alters, Z was
   caught because the test checks message M which Z changes").

4. **Named red tests, not a count** — the committed front record must name the exact test(s) that
   go red under each adverse mutation, never a bare "3 tests fail." A proof that
   says "3 tests fail" without naming them cannot be acted on; the reviewer cannot
   verify the claim against specific assertions.

For proof-of-limitation cases (§"Proof-of-limitation cases"), the adverse search
applies equally: attempt to construct a production-code change that satisfies the
ideal the test asserts, and declare the result. If the ideal is genuinely
unattainable (as by design), the committed front record must name the three attempted changes and
explain why each still falls short. The legacy API trace keeps the same evidence in its existing
location.

### Proof-of-limitation cases (no mutation)

This is an optional evidence category, not a bug/regression proof and not required by the bug-fix
scope below. If a front PR deliberately declares one, the same kept-red path and replay mechanics
apply.

Some paired proofs are **proofs of limitation**, not proofs of a bug. The red test asserts an
*ideal* behavior the correct code deliberately does not satisfy (a known trade-off, not a defect),
so the red is produced by the **correct code as committed** — there is no mutation to apply.
The worked example for #1613/#1651 in this section is one: the hook is a pure derivation and
cannot force a caller to commit its return, so a negligent-caller test that asserts the ideal
("the reset sticks even without a commit") fails against the correct code.

For front proof-of-limitation cases, the committed record MUST still name the kept red test and the
green summary, and MUST replace the mutation with the ideal/trade-off evidence below. The legacy API
trace keeps the same requirement in its existing location:

- the **ideal behavior** the test asserts,
- the **reason the correct code does not satisfy it** (the trade-off that makes the ideal
  unattainable), and
- the **expected failure message**, so a reviewer without local scratch files can reconstruct
  the red by writing a test that asserts the ideal against the current code.

The convention's goal is unchanged: a reviewer must be able to obtain the red in one named
manipulation. For bug-fix proofs, that manipulation is "apply the mutation, run the kept test,
revert." For proof-of-limitation proofs, it is "run the kept test against the current code."

### Replaying the proof from a detached worktree

Front proof tests under `apps/front/tests/proofs/` are **versionned** (committed to the repo),
so any worktree that checks out the branch — including a detached worktree — can always see them.
A reviewer working from `develop` (without checking out the lane branch) can run them directly:

```
cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
    tests/proofs/<issue>/<name>.test.ts
```

A reviewer who cannot or will not run the test can also rely on the committed record being self-sufficient:
it names the kept red test's path, the mutation to apply (or, for proof-of-limitation cases, the
ideal behavior and the reason the correct code does not satisfy it), and the expected failure
message, so the red can be reconstructed by hand against the current code.

The committed front record must also carry the mutation (or the ideal/trade-off for proof-of-
limitation cases), not a local scratch artifact, because `git diff`-based detection in CI only
identifies *which* proofs to run, not *what* they prove. The legacy API trace remains in its
existing `.dump/preuves/<issue>/` location.

### When this convention does not apply

A PR opts into this convention by declaring a supported front proof under
`apps/front/tests/proofs/<issue>/`. Once declared, every kept-red and replay requirement in this
section is mandatory. The legacy API trace form remains documented above; this section does not
create a universal kept-red requirement for API, Node/CI, generators, custom linters, or other
repository surfaces that have no supported runner and versioned proof location.

An admitted executable guard still requires red/green admission evidence, but supplies it through a
co-located violating fixture or documented temporary mutation as defined above, not a permanently
red test. A kept-red paired proof is **not** required for:

- pure refactors with no behavior change;
- new features that do not regress an existing behavior;
- doc-only and config-only changes.

An executable guard produced without the admission evidence above is vacuous and will be rejected in
review regardless of this convention.

### What the CI guard checks — and what remains review-only

The CI step `Verify paired red proofs` (`apps/front/scripts/ci/run-proofs.mts`) runs in the
path-gated `supply-chain` job of the front supply-chain CI workflow
(`.github/workflows/front-ci.yml`), for PRs whose changed paths match that job's front-relevant
filter — which `apps/front/tests/proofs/<issue>/` falls under. When that job runs, the step
detects, via `git diff` against the merge-base, which `.test.ts`/`.test.tsx` files under
`apps/front/tests/proofs/<issue>/` the PR added or modified, and replays only those with inverted
semantics: a declared test that fails as expected passes the step; a declared test that
unexpectedly passes, or a manifest that is missing/malformed/unreadable, fails the step loudly
naming the file and the cause. A PR that declares no proofs prints an explicit no-op message and
exits 0. This closes the gap issue #1659 raised, for front proofs entering that job.

What remains a review responsibility, not an automated one: committed front-proof evidence and
PR-body prose (for example, whether the mutation, adverse-mutation search, and green run summary
are honest), plus `.dump/` API trace claims, since `.dump/` is git-ignored and absent on a clean CI
checkout; and whether a PR ought to declare a proof at all, since declaration stays voluntary (see
§"When this convention does not apply"). No meta-scanner over `.dump/` or PR prose is added, for
the reasons issue #1659 already raised:
`.dump/` never reaches CI, and requiring the test path to exist in the suite would contradict the
convention. If a future lane produces a paired proof without following the trace requirements, the
right response is a review comment naming the relevant section, not a CI failure.

### Worked example: #1613 / #1651 (negligent caller of `useOffsetPageClamp`)

The red test that PR #1651 deleted is kept at
`apps/front/tests/proofs/1613/red-1613-negligent-caller-no-reset.test.ts` in this branch,
with the mutation and red/green evidence in its committed proof docblock and manifest. A reviewer
replays the red by checking out this branch and running:

```
cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
    tests/proofs/1613/red-1613-negligent-caller-no-reset.test.ts
```

This is the first application of the convention; it is the only case the present branch
converts. Other past proofs in the repo are out of scope for #1659 by design (see
"Anything in this brief that turned out to be wrong" in the PR body).
