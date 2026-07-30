# Local CI gate (`just ci`)

`just ci` is the pre-push gate. It mirrors what `.github/workflows` actually runs, so
a green run locally is a strong prediction that CI would be green too.

This matters more than it normally would: the repo is on a Free plan with a private
repo (2,000 Actions minutes/month), and July 2026 burned 2,202. Until the allowance
resets and stays under budget, **this gate is the pre-merge net** — see issue #869.

## The two targets

| | `just ci` | `just ci-full` |
| --- | --- | --- |
| Workflow drift guard | yes | yes |
| Exact-pin + frozen-lockfile install | yes | yes |
| `pnpm format` (repo-wide oxfmt) | yes | yes |
| Lint (oxlint scope CI uses, disables audit, barrel check) | yes | yes |
| front build, CSS-asset check, bundle isolation, smoke start, typecheck, design system, unit tests | yes | yes |
| old-front unit characterization + typecheck | yes | yes |
| `openapi.json` / `client-ts` drift + OpenAPI contract spec | yes | yes |
| `ci-migration-expand-contract` | yes | yes |
| **Full API test suite** (`just test-api`) | yes | yes |
| front e2e (docker compose + Playwright) | no | yes |
| old-front e2e characterization (docker compose + Playwright) | no | yes |

`just ci` is the everyday loop. Run `just ci-full` before merging anything that touches
frontend behaviour, since that is where the e2e suites earn their runtime.

Sub-gates are ordinary recipes (`just ci-drift`, `just ci-front`, …), so you can run one
in isolation while iterating. `just` stops at the first failing recipe and names it:

```
error: Recipe `ci-lint` failed on line 251 with exit code 1
```

## The API-suite asymmetry (read this once)

**No workflow runs the API test suite.** The only `dotnet test` in CI is
`openapi-spec-drift.yml`'s `--filter "FullyQualifiedName~OpenApiContractSpec"`. The other
~1,150 tests have always been local-only.

So for backend work, `just ci` is **stronger than CI has ever been**, and its absence from
CI is exactly why the local gate is worth having. `just test-api` runs in the `ci` target
rather than only `ci-full` because ~1.7 minutes is a fair price for the best signal the
repo has.

## What CI has that the local gate cannot

These are exempt in the drift manifest, each with a recorded reason:

- **`require-linked-issue.yml`** — reads `github.event.pull_request.body`. At pre-push time
  there is no PR, so it is unreproducible locally by construction. It stays a GitHub check.
- **`actions/upload-artifact`** and the failure-only log capture that feeds it — they exist
  to get files off an ephemeral runner. Locally the reports are already on disk.
- **Checkout and toolchain setup** (`setup-node`, `setup-dotnet`, `pnpm/action-setup`,
  `setup-just`) — the local machine already is the environment; versions are pinned by
  `.node-version`, `global.json`, and the `packageManager` field.

## The drift guard

A hand-mirrored gate rots. Someone adds a step to a workflow, nobody adds it here, and
`just ci` keeps printing PASSED while CI would fail. `just ci-drift`
(`scripts/check-ci-drift.mjs`) exists to make that impossible to do quietly.

### Mechanism

It parses every `.github/workflows/*.yml` and content-addresses each step — the `run:` or
`uses:`, plus its `with:`, `env:`, and `if:` — then compares it against
`scripts/ci-gate-manifest.json`, which holds one entry per step:

```json
"front-ci.yml::supply-chain::Typecheck front": {
  "hash": "780f674ec757c52e",
  "mirror": "just ci-front",
  "reason": "ci-front runs the identical pnpm --filter front typecheck."
}
```

The gate fails on:

| Finding | Meaning |
| --- | --- |
| `NEW STEP` | CI grew a step nothing here accounts for. |
| `CHANGED` | A reconciled step's command, inputs, env, or condition changed. |
| `STALE` | The manifest reconciles a step that no longer exists. |
| shape error | An entry with no `mirror`, or a `reason` under 24 characters. |

It also fails closed when two steps in a job share an identity, since one could otherwise
hide behind the other's entry forever.

### What it proves — and what it does not

It proves exactly one thing, mechanically: **every CI step has been consciously reconciled
against this gate, and any change forces that judgement to be made again.** Silent drift
becomes loud drift.

It does **not** prove that `mirror` is semantically equivalent to the CI step. That is a
human assertion, reviewed like any other code. No parser can decide whether `just test-api`
"is" a given shell snippet, and a guard that faked it — say, by grepping the justfile for
fragments of the `run:` block — would hand out confident green on a mirror that had quietly
stopped matching. That is the failure this guard exists to prevent, so it is not simulated.

The guard's own failure modes are covered by `scripts/check-ci-drift.test.mjs`
(`pnpm test:ci-drift`), which `just ci-drift` runs first. One of those tests asserts that
this repo's real workflows are fully reconciled, so the guard cannot rot into a check that
always returns green.

### When it fires

1. Read the workflow step it points at.
2. Mirror it in the relevant `ci-*` recipe, **or** decide it cannot run locally.
3. Update `scripts/ci-gate-manifest.json`: set `mirror` (or `null`), write a real `reason`,
   and set `hash` to the value in the failure message.

Do not bump the hash without doing step 1. The hash is only meaningful if someone looked.

## Known gaps

Recorded here rather than hidden, so they can be judged:

- **`just ci-lint` does not lint the whole repo.** It uses CI's scope
  (`apps/front packages/shared-ts scripts` — `scripts/` was added by #1017, which closed
  the gap where it had no CI lint coverage at all). Issue #803 owns broadening this gate to
  repo-wide `oxlint` and resolving the remaining pre-existing warnings. Until then,
  the narrower scope intentionally mirrors CI.
- **`just ci-e2e-old-front` delegates to the app's `test:e2e:fresh`**, which omits
  `--remove-orphans` and CI's explicit `--wait-timeout 180`.
- **The e2e recipes run `playwright install chromium` without CI's `--with-deps`.** That
  flag shells out to `sudo apt-get`, and a pre-push gate must not require root. The browser
  binary still installs; the system libraries behind `--with-deps` are a one-time developer
  setup — run `npx playwright install-deps` once if Playwright complains about them.
- **`just ci-e2e-front` resets the stack before starting** instead of tearing down with
  CI's `if: always()`, which a justfile cannot express. A failed run therefore leaves its
  stack up (useful for inspection); the next run resets it.
- **The front smoke-start step** is inline bash in CI and Node
  (`apps/front/scripts/smoke-start-server.mjs`) locally, because the justfile runs under
  `pwsh` on Windows. Same assertions, different implementation; the drift guard pins the
  workflow side so the two cannot part ways unnoticed. It also binds a free ephemeral port
  rather than CI's hardcoded 3000 — a dev machine often has something on 3000 already, and
  asserting against whatever answers there would be a false green.
- **`ci-migration-expand-contract` has heuristic gaps that require review judgment:**
  - It does not inspect aliased/bound migration-builder variables (`var mb = migrationBuilder; mb.DropColumn(...)`).
  - It does not inspect dynamically-built SQL strings passed to `migrationBuilder.Sql(...)`.
  - It does not inspect `AddForeignKey`, `AddCheckConstraint`, unique `CreateIndex`, or `DropPrimaryKey` ops.
  - For these residual cases, use the escape hatch marker (`// expand-contract-ok: ...`) as the explicit review override when the change is intentional.

## Required-check limitations (accepted)

PR #1029 (closing #1017) made `front-e2e-gate`, `front-ci-gate`, `openapi-spec-drift-gate`, and
`docs-archive-gate` report on every pull request, closing the deadlock where a required check that
never runs never reports and blocks the PR forever. Two platform limitations remain once the
repository ruleset requires those four contexts. Both were reviewed and both are accepted rather
than fixed in code — recorded here rather than hidden, so they can be judged:

- **A head commit skip instruction suppresses all four required checks.** GitHub does not run a
  workflow at all when its triggering commit's message contains `[skip ci]`, `[ci skip]`,
  `[no ci]`, `[skip actions]`, `[actions skip]`, or carries a `skip-checks: true` trailer, and
  anyone with push access can set one. The associated required checks then never report — they sit
  **Pending**, not failing — so the pull request blocks indefinitely instead of merging unguarded.
  That distinction (a missing result, not a red one) is the entire reason it blocks rather than
  passes: if you find a PR stuck on a required check with no run anywhere in its history, this is
  why. Accepted because only someone with push access can trigger it, and that same person could
  edit the ruleset directly anyway — closing this path would defend against nothing a determined
  maintainer could not already do. The alternative, a privileged base-controlled reporting workflow
  immune to PR commit messages, would have to run with elevated permissions against
  pull-request-authored input, which is a worse trade than the gap it would close.
- **A fork pull request that touches the frontend cannot satisfy `front-e2e-gate`.** The repository
  is public, so pull requests can come from forks. `front-e2e-gate`'s build job needs
  `packages: write` to push four container images, and GitHub downgrades fork PR tokens to
  read-only regardless of contributor approval. A fork PR that genuinely changes frontend code
  therefore goes red on `front-e2e-gate` — correctly, not falsely green — and cannot become
  mergeable without moving the branch into the base repository. Current settings: the repository is
  public, default workflow permissions are read, and fork PR contributor approval is
  `first_time_contributors`. Accepted because there are no fork contributors today. When the first
  one arrives, the fix is a one-line instruction, not a redesign: **have them (or a maintainer) push
  the branch into the base repository** so the workflow runs with base-repo write permissions.

## Runtime

Measured on a warm Linux checkout with warm docker layers. A cold run is
substantially slower — the first `ci-full` pays several minutes to build the e2e images.

| Target | Time | Notes |
| --- | --- | --- |
| `just ci` | ~4m 20s | of which `just test-api` is ~1m 45s (1,158 tests) |
| `just ci-e2e-front` | ~8m 15s | 180 Playwright tests + docker stack |
| `just ci-e2e-old-front` | ~8m | 13 Playwright tests; mostly docker build |
| `just ci-full` | ~21m | the two e2e suites are ~80% of it |

That split is the reason `ci` and `ci-full` are separate targets: the everyday loop stays
in the 4-minute range, and you pay the 20 minutes only when frontend behaviour changed.

## Concurrency

All six workflows now set `concurrency` with `cancel-in-progress: true`. During
agent-driven work a PR can take many pushes, and without this every superseded run bills
in full while reviewing nothing. Keep the group keyed on `${{ github.ref }}` when adding a
workflow.
