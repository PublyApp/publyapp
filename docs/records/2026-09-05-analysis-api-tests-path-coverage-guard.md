# API-tests path-coverage guard admission and correction

Date: 2026-09-05
Issue: #2005
Scope: correction of the existing API-suite path-filter coverage guard

## Decision

Keep the guard as a small, unconditioned `api-tests.yml::path-coverage` job. It runs the
standalone Node CLI on every pull request, while `api-tests-gate` includes the job in its
required `needs` set. The CLI's classifier input is taken only from the executable
`jobs.changes.steps[id=filter].run` block. It requires exactly one effective command of the
form `node "$CLASSIFIER" '<regex>'`; comments, `echo`/no-op forms, conditional filter steps,
and `continue-on-error` are not accepted.

This is the narrowest existing tool surface that owns the invariant. It adds no new guard
framework, guard-of-guard, baseline, allowlist, or ratchet. The Vitest tests exercise the
parser and spawn the same standalone CLI that CI runs.

## Admission evidence

1. **Current reproducible failure and critical invariant.** Issue #2005 demonstrated that the
   previous Vitest-only guard ran inside relevance-gated `front-ci::gate-selftest`. Changes to
   `PublyApp.slnx`, API specs, `.csproj` files, and AppHost sources were invisible to that
   classifier, so the change that could break the guard skipped the guard. The protected
   invariant is build/release integrity: every project compiled by the API barrier must be
   reachable by a workflow path filter, and the required check must not silently omit it.
2. **Why an ordinary test or standard tool is insufficient.** A normal unit test can check the
   coverage algorithm but cannot make the required GitHub job run for inputs outside the
   classifier's known path set. GitHub's native path filters do not express the cross-file
   relationship between solution/spec references and all barrier filters. The existing local
   CI drift guard only reconciles step content; it does not execute a standalone guard on every
   pull request. The one CLI plus one unconditioned job closes both gaps without a new framework.
3. **Explicit maintenance cost.** The repository owns one small YAML-subset parser for
   `on.push.paths` and one executable-step parser for `jobs.changes.steps[id=filter].run`. A
   workflow-shape change must update the focused tests and reconcile the CI manifest/reason
   reference. The unconditioned job spends one checkout, pinned Node 24 setup, and one cheap
   pure-Node scan per pull request. The path-coverage tests and CLI must remain aligned with
   the real workflow, solution, and spec source shapes.
4. **Retirement/replacement condition.** Retire this CLI/job and its manifest entries when a
   supported GitHub-native required-check mechanism, or a replacement workflow architecture,
   guarantees that every `PublyApp.slnx` project and every API-spec-compiled project both wakes
   the compiling barrier and is included in the required check without this repository-owned
   cross-file scan. Until that condition is verified, removing the job recreates #2005.
5. **Mutation-red and restored-green proof.** On the real workflow, temporarily changed the
   executable classifier line from `node "$CLASSIFIER" '...'` to `echo node "$CLASSIFIER" '...'`,
   then ran:

   ```text
   $ node packages/scripts-ts/src/check-api-tests-path-coverage.ts
   [api-tests-path-coverage] guard could not analyze the real tree and fails loud:
     api-tests.yml `jobs.changes.steps[id=filter].run` must contain exactly one effective command matching `node "$CLASSIFIER" '<regex>'`; found 0. Comments, echo/no-op commands, conditional forms, and tolerated steps are not executable classifier commands.
   mutation_exit=1
   ```

   The mutation was restored before this record and before commit. The focused correction tests
   also first ran RED against the prior WIP: `8 tests | 2 failed`, with the exact-command
   property missing and the commented mutation incorrectly not throwing. After the parser,
   exact-command checks, CLI spawn proof, and Node setup were restored, the same focused command
   ran GREEN with `8 tests | 8 passed`, and the standalone CLI printed:

   ```text
   [api-tests-path-coverage] every API-suite-compiled project is reached by a .NET barrier path filter. [OK]
   ```

## Verification commands

- `pnpm --filter scripts-ts exec vitest run src/check-api-tests-path-coverage.test.ts`
- `node packages/scripts-ts/src/check-api-tests-path-coverage.ts`
- `node packages/scripts-ts/src/gen-reason-ref.ts`
- `git diff --check`

No permanent red-proof runner was added. The fixture mutation and temporary real-tree mutation
are reproducible admission evidence, not a second policy guard.
