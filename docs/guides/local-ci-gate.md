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
| front e2e (docker compose + Playwright + drawer-contrast Vitest guard) | no | yes |
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
`uses:`, plus its `with:`, `env:`, `if:`, and `continue-on-error:` — then compares it against
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
| `CHANGED` | A reconciled step's command, inputs, env, condition, or continue-on-error flag changed. |
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

## Required-check uniqueness

GitHub keeps only the **latest** report for a status-check context on a commit. A required context
reported by two independently-timed jobs is therefore a false-green risk: if the real gate fails
first and the second reporter succeeds later, the required context ends green over failed required
work. Measured on this PR's head, a second reporter finished four minutes after the real gate.

Two rules keep each of the four required contexts to exactly one producer, both enforced by
`scripts/check-ci-gate-structure.mjs` (which the required `front-ci-gate` job runs as one of its
own steps):

- Each gate job's `name:` is an **allowlist** expression — it resolves to the externally required
  name only for `pull_request` and `merge_group`, and to a non-required `<workflow>-push-check`
  name for any other event. A gate workflow's `on:` may additionally declare only `push`; any other
  event is rejected outright. Both halves matter: an earlier `github.event_name == 'push' && … || …`
  form resolved to the *required* name for every non-push event, so simply adding
  `workflow_dispatch:` produced a second reporter (a manual run takes a branch/tag ref and uses its
  last commit as `GITHUB_SHA`).
- The guard scans **every job in every workflow in the repository** and requires each of the eight
  reserved names (four required contexts plus four push checks) to have exactly one producer: the
  authorized gate job, carrying its exact pinned expression. GitHub reports a job under its `name:`
  when it has one and its job ID otherwise, so both are checked. No other job may carry a `${{ }}`
  expression in its `name:` at all — an expression can resolve to a reserved name without containing
  it, and this guard cannot evaluate GitHub expressions, so a new dynamic job name is a reviewed
  decision (add it to the authorized set in the guard) rather than something that arrives silently.

`scripts/check-ci-drift.mjs` is deliberately blind here: it hashes step fields only
(`continue-on-error`, `env`, step `if`, `run`, `uses`, `with`), so adding a job-level `name:` to an
unrelated job leaves every one of its manifest keys and hashes untouched. That is the drift guard's
correct contract; required-context uniqueness is the structure guard's job.

Because that scan asserts against every workflow in the repository, `front-ci.yml`'s changed-path
classifier matches the whole `.github/workflows/` prefix — not a list of the four gate files.
Otherwise an edit to a non-gate workflow classifies as irrelevant and skips the only two jobs that
run the guard server-side.

## Required-check limitations (accepted)

PR #1029 (closing #1017) made `front-e2e-gate`, `front-ci-gate`, `openapi-spec-drift-gate`, and
`docs-archive-gate` report on every pull request, closing the deadlock where a required check that
never runs never reports and blocks the PR forever. Three platform limitations remain once the
repository ruleset requires those four contexts. All three were reviewed and all three are accepted
rather than fixed in code — recorded here rather than hidden, so they can be judged:

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
- **A YAML-valid but semantically-invalid expression can prevent a required job from ever being
  created.** GitHub validates a workflow's expressions (e.g. `${{ ... }}` syntax, undefined
  functions) when the run starts, separately from YAML syntax. A mutation such as setting
  `concurrency.group: ${{ definitely_not_a_function() }}` at the top of `front-ci.yml` parses as
  valid YAML, passes every guard and all 239 guard tests (none of them run inside GitHub Actions'
  own expression evaluator, and `actionlint` — the closest local equivalent — is not installed or
  run anywhere in this repository), and only fails once GitHub actually tries to start the run. When
  that happens, the workflow fails at startup **before any job is created** — including
  `front-ci-gate` itself, and including `gate-selftest` and the round-5 self-check step added to
  `front-ci-gate` (see above), both of which live inside the same invalid file and therefore never
  run either. No script in this repository, local or server-side, can observe or react to a failure
  that happens before its own job exists. This is accepted, not fixed, for one load-bearing reason:
  a required context that is **never created** behaves the same way GitHub already documents for a
  required check that never runs at all (the same "Pending"/"Expected — Waiting for status to be
  reported" state this file's `[skip ci]` limitation above describes) — the pull request blocks
  instead of merging unguarded. The failure mode is an availability problem (a legitimate PR gets
  stuck until a human notices and fixes the expression), not a correctness problem (broken code does
  not merge as a result). That is a materially different, and much less severe, class of bug than
  the five this PR's round 5 fixes close, each of which made a required context report **success**
  over something that had actually failed.

  The strongest available mitigation considered and NOT implemented here: a separate
  `workflow_run`-triggered watchdog workflow that inspects each of the four gate workflows'
  completed runs (via the Actions API) and, when a run's conclusion indicates a startup/validation
  failure with zero jobs created, posts a synthetic `failure` commit status for that same required
  context name via the Statuses API — turning "never reported" into an explicit red, one workflow
  removed from the file that could be invalid. It was not built into this PR because: (1) it would
  be a new, independently-invalid-YAML-immune piece of infrastructure whose own correctness (event
  timing, SHA correlation across possibly-superseded runs, not clobbering a later legitimate success
  with a stale watchdog verdict) needs the same adversarial scrutiny this whole feature has already
  been through five rounds of, and getting it wrong risks turning a fail-safe "stuck PR" into an
  actual fail-open hole; (2) the gap it would close is already fail-safe by GitHub's own documented
  behavior, so the marginal benefit (a clearer error message sooner) is smaller than the risk of a
  new, undertested privileged reporting path. If this ever needs revisiting, that watchdog design is
  the place to start — but it should get its own round of adversarial review before merging, not
  ride in in a rushed final commit of a five-round PR.

## Runtime

Measured on a warm Linux checkout with warm docker layers. A cold run is
substantially slower — the first `ci-full` pays several minutes to build the e2e images.

| Target | Time | Notes |
| --- | --- | --- |
| `just ci` | ~4m 20s | of which `just test-api` is ~1m 45s (1,158 tests) |
| `just ci-e2e-front` | ~8m 15s | 180 Playwright tests + the 107-test drawer-contrast Vitest source guard + docker stack |
| `just ci-e2e-old-front` | ~8m | 13 Playwright tests; mostly docker build |
| `just ci-full` | ~21m | the two e2e suites are ~80% of it |

That split is the reason `ci` and `ci-full` are separate targets: the everyday loop stays
in the 4-minute range, and you pay the 20 minutes only when frontend behaviour changed.

## Concurrency

All six workflows now set `concurrency` with `cancel-in-progress: true`. During
agent-driven work a PR can take many pushes, and without this every superseded run bills
in full while reviewing nothing. Keep the group keyed on `${{ github.ref }}` when adding a
workflow.
