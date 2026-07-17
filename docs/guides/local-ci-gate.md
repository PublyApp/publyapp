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
| front-2 build, CSS-asset check, bundle isolation, smoke start, typecheck, design system, unit tests | yes | yes |
| front-2-spike build | yes | yes |
| front unit characterization + typecheck | yes | yes |
| `openapi.json` / `client-ts` drift + OpenAPI contract spec | yes | yes |
| **Full API test suite** (`just test-api`) | yes | yes |
| front-2 e2e (docker compose + Playwright) | no | yes |
| front e2e characterization (docker compose + Playwright) | no | yes |

`just ci` is the everyday loop. Run `just ci-full` before merging anything that touches
frontend behaviour, since that is where the e2e suites earn their runtime.

Sub-gates are ordinary recipes (`just ci-drift`, `just ci-front-2`, …), so you can run one
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
"front-2-ci.yml::supply-chain::Typecheck front-2": {
  "hash": "c8c46730ebd110db",
  "mirror": "just ci-front-2",
  "reason": "ci-front-2 runs the identical pnpm --filter front-2 typecheck."
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
  (`apps/front-2 packages/shared-ts`). `just lint` — `oxlint --quiet .` — is red on
  `develop` over pre-existing errors in `apps/front-2-spike`, which no workflow lints.
  Using the superset would fail the gate on things CI passes, and a gate that cries wolf
  gets ignored. Run `just lint` deliberately when touching the spike.
- **`just ci-e2e-front` delegates to the app's `test:e2e:fresh`**, which omits
  `--remove-orphans` and CI's explicit `--wait-timeout 180`.
- **The e2e recipes run `playwright install chromium` without CI's `--with-deps`.** That
  flag shells out to `sudo apt-get`, and a pre-push gate must not require root. The browser
  binary still installs; the system libraries behind `--with-deps` are a one-time developer
  setup — run `npx playwright install-deps` once if Playwright complains about them.
- **`just ci-e2e-front-2` resets the stack before starting** instead of tearing down with
  CI's `if: always()`, which a justfile cannot express. A failed run therefore leaves its
  stack up (useful for inspection); the next run resets it.
- **The front-2 smoke-start step** is inline bash in CI and Node
  (`apps/front-2/scripts/smoke-start-server.mjs`) locally, because the justfile runs under
  `pwsh` on Windows. Same assertions, different implementation; the drift guard pins the
  workflow side so the two cannot part ways unnoticed. It also binds a free ephemeral port
  rather than CI's hardcoded 3000 — a dev machine often has something on 3000 already, and
  asserting against whatever answers there would be a false green.

## Runtime

Measured on a warm Linux checkout with warm docker layers. A cold run is
substantially slower — the first `ci-full` pays several minutes to build the e2e images.

| Target | Time | Notes |
| --- | --- | --- |
| `just ci` | ~4m 20s | of which `just test-api` is ~1m 45s (1,158 tests) |
| `just ci-e2e-front-2` | ~8m 15s | 180 Playwright tests + docker stack |
| `just ci-e2e-front` | ~8m | 13 Playwright tests; mostly docker build |
| `just ci-full` | ~21m | the two e2e suites are ~80% of it |

That split is the reason `ci` and `ci-full` are separate targets: the everyday loop stays
in the 4-minute range, and you pay the 20 minutes only when frontend behaviour changed.

## Concurrency

All six workflows now set `concurrency` with `cancel-in-progress: true`. During
agent-driven work a PR can take many pushes, and without this every superseded run bills
in full while reviewing nothing. Keep the group keyed on `${{ github.ref }}` when adding a
workflow.
