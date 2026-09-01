# Local CI gate (`just ci`)

`just ci` is the pre-push gate. It mirrors what `.github/workflows` actually runs, so
a green run locally is a strong prediction that CI would be green too.

This matters more than it normally would: the repo is on a Free plan with a private
repo (2,000 Actions minutes/month), and July 2026 burned 2,202. Until the allowance
resets and stays under budget, **this gate is the pre-merge net** — see issue #869.

## Quality gate (issue #803)

`quality-gate.yml` fails PRs on (a) any `oxlint` diagnostic repo-wide (via `pnpm lint` —
`oxlint --quiet .` plus `lint:disables` and `check:frontend-barrels` — and the format
check `pnpm format` which runs `oxfmt --check`) and (b) any .NET analyzer or code-style
warning, because `Directory.Build.props` sets `TreatWarningsAsErrors` +
`EnforceCodeStyleInBuild` so a `dotnet restore` + `dotnet build` of `PublyApp.slnx` with
those props active is the gate, plus the custom analyzer tests in
`packages/lint-cs` (`just test-analyzers`).

Local mirror (same property, same commands CI runs):

```bash
pnpm format        # oxfmt --check over the repo globs in package.json
pnpm lint          # repo-wide oxlint + disables/barrel guards
just ci-knip       # knip: unused files/deps/exports/types + duplicate exports (#455)
just ci-quality    # pnpm format + pnpm lint + dotnet restore+build (PublyApp.slnx, APP_ROLE=api) + just test-analyzers
# or the two halves separately:
just ci-quality-dotnet   # dotnet restore + build (warnings as errors)
just test-analyzers      # Roslyn analyzer unit suite
```

`quality-gate.yml::quality::Knip (unused exports & dependencies)` runs
`pnpm exec knip` against the root `knip.ts`; `just ci-knip` is the identical
invocation. Exit 0 is the contract on both sides: every knip exception must be
a scoped entry with an inline reason in `knip.ts`, never a blanket ignore.
Root `knip.ts` itself is in the workflow's push `paths:` list and in the PR
classifier regex, so config edits always re-run the step.

CI needs `APP_ROLE=api` + `TRUSTED_PROXY_CIDRS` for the build step (the build boots the
app to emit `openapi.json`; without the pin it fails fast in Production). The recipes
pin both (`just ci-quality-dotnet` and `quality-gate.yml::quality::{Restore,Build} .NET solution`
both export `APP_ROLE=api`, `TRUSTED_PROXY_CIDRS=127.0.0.1/32`). Path filter mirrors the
other gates' `Determine changed paths` pattern and covers: the workflow itself,
`.oxlintrc.json`, `.oxfmtrc.json`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`turbo.json`, `.npmrc`, `Directory.Build.props`, `Directory.Build.targets`,
`Directory.Packages.props`, `global.json`, `PublyApp.slnx`, `apps/**`, `packages/**`,
`packages/scripts-ts/**`.

## Actions pin/comment binding (issue #1392)

The sibling guards prove every `uses:` is pinned to a full 40-hex SHA. Neither
proves the SHA **is the commit its `# vX.Y.Z` comment claims** — a wrong SHA
under a right-looking comment passed every gate green (verified by hand during
the #1381 review).

`packages/scripts-ts/src/check-actions-pins.ts` closes that gap. It scans the
same tree as the sibling guard (`.github/workflows/**`, `.github/actions/**`,
plus every local action reachable through `uses: ./<path>`), resolves each
comment's tag through `gh api repos/<owner>/<repo>/git/ref/tags/<tag>` (peeling
annotated tags to their commit — `pnpm/action-setup@v6.0.10` is annotated, so
the peel is load-bearing), and compares against the pinned SHA.

Fail-loud classes (no compliant default):

- a `uses:` value that is not a 40-hex pin, has no `@ref`, or is otherwise unparseable;
- a pin without a version comment, or whose comment does not parse as `v<major>[.minor[.patch]]`;
- a referenced tag that does not exist upstream;
- any resolver/API failure — the guard FAILS, never passes silently;
- a scan that judged zero files or zero pins (anti-rot, mirrors the sibling guard).

Local `./…` and `docker://` references are the only allowlisted non-pinned forms.

Run it with `just ci-actions-pins` (unit suite + live scan). It is
network-dependent, so the recipe accepts `ARGS="--offline"` to skip the live
half for air-gapped local work; CI (`quality-gate.yml`) never passes it and
authenticates with the workflow token. Per-run caching keeps a full scan at
~16 distinct tag lookups. Paired proof convention: change one workflow SHA in a
scratch commit → the guard fails naming file:line with expected vs actual;
revert → green. Changing only the comment version must equally fail.

## The two targets

|                                                                                                   | `just ci` | `just ci-full` |
| ------------------------------------------------------------------------------------------------- | --------- | -------------- |
| Workflow drift guard                                                                              | yes       | yes            |
| CODEOWNERS contract (including protected-rule mutation proofs)                                    | yes       | yes            |
| Exact-pin + frozen-lockfile install                                                               | yes       | yes            |
| `pnpm format` (repo-wide oxfmt)                                                                   | yes       | yes            |
| Lint (oxlint scope CI uses, disables audit, barrel check)                                         | yes       | yes            |
| shared-ts typecheck + vitest suite (#1270)                                                        | yes       | yes            |
| front build, CSS-asset check, bundle isolation, smoke start, typecheck, design system, unit tests | yes       | yes            |
| ~~old-front unit characterization + typecheck~~ (deleted 2026-08-22, archived) | — | — |
| `openapi.json` / `client-ts` drift + OpenAPI contract spec                                        | yes       | yes            |
| NuGet vulnerability audit (`just nuget-audit` / `node packages/scripts-ts/src/nuget-audit.ts`)      | yes       | yes            |
| `ci-migration-expand-contract`                                                                    | yes       | yes            |
| Project PR-closure adapter contract (`pnpm test:project-closure-adapter`)                         | yes       | yes            |
| **Full API test suite** (`just test-api`)                                                         | yes       | yes            |
| front e2e (docker compose + Playwright + drawer-contrast Vitest guard)                            | no        | yes            |
| ~~old-front e2e characterization~~ (deleted 2026-08-22, archived) | — | — |

`just ci` is the everyday loop. Run `just ci-full` before merging anything that touches
frontend behaviour, since that is where the e2e suites earn their runtime.

`pnpm test:project-closure-adapter` is now a permanent subgate of `front-ci`.
It runs in `front-ci.yml::gate-selftest` and is mirrored by
`ci-project-closure-adapter` in `just ci` and required during PR closure in
`.ai/project-closure-v1.json` (`local_review_ready_commands` and
`closure_acceptance_commands`).

Sub-gates are ordinary recipes (`just ci-drift`, `just ci-front`, …), so you can run one
in isolation while iterating. `just` stops at the first failing recipe and names it:

```
error: Recipe `ci-lint` failed on line 251 with exit code 1
```

## The API-suite asymmetry (read this once)

**Since #1462, a workflow runs the API test suite.** `.github/workflows/api-tests.yml`
runs `just test-api` (~2,000 specs on real Postgres via Testcontainers) as the
required `api-tests-gate` check on PRs, with the same #1017 aggregate-gate shape
(changes classifier -> heavy job -> gate) as every other gate. The only remaining
`dotnet test` asymmetry is `openapi-spec-drift.yml`'s contract-only filter.

`just ci` still runs the full suite locally via its final recipe, so it remains the
fastest pre-push signal; CI now independently enforces what used to be local-only.
The suite is relevance-classified in CI: doc-only changes skip the heavy job while
the required `api-tests-gate` context still reports (passing on verified-irrelevant
changes, per the aggregate-gate contract).

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
(`packages/scripts-ts/src/check-ci-drift.ts`) exists to make that impossible to do quietly.

### Mechanism

It parses every `.github/workflows/*.yml` and content-addresses each step — the `run:` or
`uses:`, plus its `with:`, `env:`, `if:`, and `continue-on-error:` — then compares it against
`packages/scripts-ts/src/ci-gate-manifest.json`, which holds one entry per step:

```json
"front-ci.yml::supply-chain::Typecheck front": {
  "hash": "780f674ec757c52e",
  "mirror": "just ci-front",
  "reason": "ci-front runs the identical pnpm --filter front typecheck."
}
```

The gate fails on:

| Finding     | Meaning                                                                                 |
| ----------- | --------------------------------------------------------------------------------------- |
| `NEW STEP`  | CI grew a step nothing here accounts for.                                               |
| `CHANGED`   | A reconciled step's command, inputs, env, condition, or continue-on-error flag changed. |
| `STALE`     | The manifest reconciles a step that no longer exists.                                   |
| shape error | An entry with no `mirror`, or a `reason` under 24 characters.                           |
| `SMOKE ENV` | A step starts the front standalone server but doesn't set NODE_ENV=production.          |
| `UPLOAD ARTIFACT` | A workflow uses actions/upload-artifact but no upload runs on the success path.    |
| `CONFESSION CONTRADICTION` | A confession names a step still present in the manifest.                      |
| `RATCHET`   | A pinned step vanished from the manifest without a confession.                          |
| `UNPINNED`  | A reconciled step is not pinned in the reference floor.                                 |

It also fails closed when two steps in a job share an identity, since one could otherwise
hide behind the other's entry forever.

### What it proves — and what it does not

It proves a handful of things, mechanically:

1. **Every CI step has been consciously reconciled** against this gate, and any change forces that judgement to be made again. Silent drift becomes loud drift.
2. **Every front-start step sets `NODE_ENV=production`** — so `validateRuntimeEnv()` is actually exercised on the CI smoke path (#1914).
3. **Every workflow that uploads artifacts has at least one success-path upload** — so the upload/download round-trip is exercised on green runs, not only on red (#1693).
4. **The ratchet floor is honest** — a covered step cannot vanish without a confession, and every reconciled step is pinned.

It does **not** prove that `mirror` is semantically equivalent to the CI step. That is a
human assertion, reviewed like any other code. No parser can decide whether `just test-api`
"is" a given shell snippet, and a guard that faked it — say, by grepping the justfile for
fragments of the `run:` block — would hand out confident green on a mirror that had quietly
stopped matching. That is the failure this guard exists to prevent, so it is not simulated.

The guard's own failure modes are covered by `packages/scripts-ts/src/check-ci-drift.test.ts`
(`pnpm test:ci-drift`), which `just ci-drift` runs first. One of those tests asserts that
this repo's real workflows are fully reconciled, so the guard cannot rot into a check that
always returns green.

### When it fires

1. Read the workflow step it points at.
2. Mirror it in the relevant `ci-*` recipe, **or** decide it cannot run locally.
3. Update `packages/scripts-ts/src/ci-gate-manifest.json`: set `mirror` (or `null`), write a real `reason`,
   and set `hash` to the value in the failure message.

Do not bump the hash without doing step 1. The hash is only meaningful if someone looked.

### Structural checks (#1693, #1914)

Beyond step reconciliation, the drift guard runs two structural checks that assert
invariants no single-step hash can capture:

**`SMOKE ENV`** — Any step whose `run:` starts the front standalone server (the
`pnpm --filter front start` / `pnpm --dir apps/front start` family, or
`node [./]apps/front/server.mjs`) must set **both** `NODE_ENV=production` and a
non-empty `PUBLIC_ORIGIN` in its `env:` block. Without `NODE_ENV=production`,
`validateRuntimeEnv()` is never exercised on the CI smoke path, and removing
it from `server.mjs` would pass CI silently. Without `PUBLIC_ORIGIN`,
`validateRuntimeEnv()` refuses to start the server at all (otherwise it would
trust the client's `Host` header when building canonical and Open Graph URLs),
so the step's smoke probe would never run against a real production server.
The recognized command forms include `pnpm start` with
`working-directory: apps/front` — a form that bypassed this check before
#1941.

**`UPLOAD ARTIFACT`** — Any workflow that uses `actions/upload-artifact` must
have at least one upload step whose `if:` is unconditional, mentions
`success()`/`always()` alone, or is the narrow eligibility form
`needs.<job>.outputs.<key> == '<literal>'` (the matrix-shard pattern), and
whose enclosing job is not failure-gated. This closes the #1693 gap where an
upload that only ran on `failure()` satisfied the step-reconciliation manifest
while the upload/download round-trip stayed unexercised on green runs. The
guard now treats the following as failure-only (must be named, never
success-capable):

- `failure()` and `cancelled()` as a bare token (a job whose `if:` is
  `cancelled()` gates every upload to red; before #1941 round-2 the
  classifier missed `cancelled()` and the gate turned silently green).
- Compound expressions that mix success-path and failure-only tokens
  (e.g. `success() && false`, `always() && cancelled()`) — the guard
  cannot statically evaluate these and surfaces a named `Unrecognized
  \`if:\`` finding listing the literal expression rather than guessing.
- Any other step-derived dynamic guard (`steps.<id>.outputs.<key> == '...'`,
  fork-rename patterns, custom boolean expressions). The matrix-shard
  privilege is the *only* dynamic form recognized; a guard that pretended
  to evaluate GitHub expressions would produce confident green on a mirror
  that had quietly stopped matching — exactly the failure mode this file
  exists to prevent.

The action is matched by its exact repo path `^actions/upload-artifact@` —
a vendor fork like `vendor/actions/upload-artifact-helper@<sha>` does not
count.

### Reason guard

Each manifest entry carries a `reason` — a human-readable explanation of how (or why) the
local gate mirrors that CI step. The reason guard pins a SHA-256 fingerprint, character
count, and the full `reason` text itself for every entry in
`packages/scripts-ts/src/reason-guard-ref.json`.

Storing the reason text (not just its hash and length) makes regenerating the reference
**visible in the diff** — a reviewer sees the actual reason text, not just opaque numbers.
This closes the #1736 bypass where a 24-character bogus reason + regenerated ref was
invisible to human review. The guard also verifies the stored hash matches the stored text
(defense-in-depth), catching a ref that was manually tampered with.

It fires when a reason **shrinks** or otherwise **changes** while the step's own hash is
unchanged — that's the window where a reason gets silently truncated during a manifest re-serialization,
or quietly weakened, without touching the step itself. A deliberate reason rewrite is still
possible: regenerate the reference with the same `reason` in the same commit:

```bash
node packages/scripts-ts/src/gen-reason-ref.ts
```

If the new reason makes the guard pass, the regen command proves the rewrite is intentional
(not an accidental truncation). The command is cited in the guard's failure message too.

### Ratchet floor (#1709)

The reason guard pins each step's reason, but until #1709 it had no memory of
**which steps had been reconciled**. A covered step could be deleted from CI,
then from the manifest, then the reference regenerated — and the guard would
turn green silently. The 3-step sequence looked like cleanup, not erasure.

The reference file now holds a `pinned_step_ids` array that grows
monotonically. Regeneration can only **ADD** step IDs to it — never remove
them. This makes the set of reconciled steps a one-way ratchet: once a step
is covered, it stays covered until a human explicitly confesses its removal.

When a pinned step is missing from the manifest, the guard produces a
`RATCHET` finding naming the step. The finding clears only one way: a
**removals confession** in `packages/scripts-ts/src/ci-gate-removals.json`
that names the step ID and says what was lost and why:

```json
{
  "steps": [
    {
      "step_id": "front-ci.yml::supply-chain::Typecheck front",
      "reason": "Typecheck folded into the lint step; the lint recipe now runs tsc --noEmit too.",
      "removed_at": "2026-08-29"
    }
  ]
}
```

The confession file is the **only** way to lower the floor. Without it,
`gen-reason-ref.ts` refuses to regenerate and exits non-zero. With it, the
regeneration succeeds and the guard turns green — the removal is deliberate,
documented, and reviewable.

The guard verifies the confession is reviewable — the reason must be at least
24 characters and must not be filler (a repeated block like `"x".repeat(24)` or
`"ab".repeat(12)`, a multi-block stack like `"ab".repeat(6) + "cd".repeat(6)`,
or a run with a single stray character like `"a".repeat(23) + "b"`), in both
`gen-reason-ref.ts` and `check-ci-drift.ts`. Beyond
that it does not judge the quality of the argument — that is a human review
concern. The guard verifies that the vanished step is **named**, so silent
erasure is impossible but legitimate removal stays possible.

### Pin completeness (#1809 r13)

The ratchet used to enforce only `pinned ⊆ steps ⊆ manifest`: it forbade
pinning anything, but never required every covered step to be pinned. A step
reconciled in the manifest could therefore sit unpinned — protected in name
only, with no pin whose disappearance would trip the ratchet. That is the
round-13 defect: `docs-archive.yml::docs-archive::Run prune-inventory guard
fixture tests` was covered by the manifest yet absent from `pinned_step_ids`,
so its justification could have vanished without the floor moving.

The invariant is now **complete**: every step in `ci-gate-manifest.json`
must appear in `pinned_step_ids` of the current reference, asserted on both
sides — `check-ci-drift.ts` emits an `UNPINNED` finding for any reconciled
step missing from the pin set (fix: regenerate, which pins the union), and
`gen-reason-ref.ts` refuses to write a reference whose pin set is not
complete. A reference from before the ratchet (no `pinned_step_ids` field)
keeps its pre-ratchet meaning: the field is what activates the floor.

A confession that names a step **still present** in the manifest is no longer
a generator-side warning or a check-side silence: it is a loud failure on both
sides (`CONFESSION CONTRADICTION` in `check-ci-drift.ts`, a hard refusal in
`gen-reason-ref.ts`). A confession exists only to authorize removing a step
from the floor; confessing a step that is still reconciled quietly asserts a
removal that did not happen, and silently desensitizes the removal path.

Recorded here rather than hidden, so they can be judged:

- **`just ci-lint` does not lint the whole repo.** It uses CI's scope
  (`apps/front packages/shared-ts packages/scripts-ts` — `packages/scripts-ts/` was added by #1017, which closed
  the gap where it had no CI lint coverage at all). Issue #803 owns broadening this gate to
  repo-wide `oxlint` and resolving the remaining pre-existing warnings. Until then,
  the narrower scope intentionally mirrors CI.
- **Former `just ci-e2e-old-front`** (deleted 2026-08-22) delegated to the app's `test:e2e:fresh`, which omitted
  `--remove-orphans` and CI's explicit `--wait-timeout 180`.
- **The e2e recipes run `playwright install chromium` without CI's `--with-deps`.** That
  flag shells out to `sudo apt-get`, and a pre-push gate must not require root. The browser
  binary still installs; the system libraries behind `--with-deps` are a one-time developer
  setup — run `npx playwright install-deps` once if Playwright complains about them.
- **`just ci-e2e-front` resets the stack before starting** instead of tearing down with
  CI's `if: always()`, which a justfile cannot express. A failed run therefore leaves its
  stack up (useful for inspection); the next run resets it.
- **The front smoke-start step** is inline bash in CI and Node
  (`apps/front/scripts/ci/smoke-start-server.mts`) locally, because the justfile runs under
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
`packages/scripts-ts/src/check-ci-gate-structure.ts` (which the required `front-ci-gate` job runs as one of its
own steps):

- Each gate job's `name:` is an **allowlist** expression — it resolves to the externally required
  name only for `pull_request` and `merge_group`, and to a non-required `<workflow>-push-check`
  name for any other event. A gate workflow's `on:` may additionally declare only `push`; any other
  event is rejected outright. Both halves matter: an earlier `github.event_name == 'push' && … || …`
  form resolved to the _required_ name for every non-push event, so simply adding
  `workflow_dispatch:` produced a second reporter (a manual run takes a branch/tag ref and uses its
  last commit as `GITHUB_SHA`).
- The guard scans **every job in every workflow in the repository** and requires each of the eight
  reserved names (four required contexts plus four push checks) to have exactly one producer: the
  authorized gate job, carrying its exact pinned expression. GitHub reports a job under its `name:`
  when it has one and its job ID otherwise, so both are checked. No other job may carry a `${{ }}`
  expression in its `name:` at all — an expression can resolve to a reserved name without containing
  it, and this guard cannot evaluate GitHub expressions, so a new dynamic job name is a reviewed
  decision (add it to the authorized set in the guard) rather than something that arrives silently.

`packages/scripts-ts/src/check-ci-drift.ts` is deliberately blind here: it hashes step fields only
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
- ~~**A fork pull request that touches the frontend cannot satisfy `front-e2e-gate`.**~~
  Fixed by #1021 — see [Fork pull requests](#fork-pull-requests-1021) below. Recorded as accepted
  between #1017 and #1021 because there were no fork contributors yet; when #1021 landed, the
  recorded decision became moot rather than acted on.
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

## Fork pull requests (#1021)

`front-e2e-gate` is required on every pull request, and this repository is public — so pull
requests can come from forks, where GitHub downgrades `GITHUB_TOKEN` to read-only
(`packages: write` is stripped regardless of contributor approval). The workflow's original
design pushed four per-run images to GHCR from the `build` job and pulled them in each shard,
which a fork token can never do: a fork PR that touched frontend code went red — correctly,
never falsely green — and was unmergeable without moving its branch into the base repository.
That behaviour is recorded as an accepted limitation above; #1021 replaced it.

The fix deliberately does **not** use `pull_request_target`: that trigger runs fork-authored
code with a base-repository write-capable token, handing untrusted input the registry
credentials. Instead, `front-e2e.yml` runs **the same four-shard matrix** on both paths,
switched by the build job's `fork` output (`github.event.pull_request.head.repo.fork`):

- **Same-repo path (unchanged):** login to GHCR, build with Compose Bake + gha cache export,
  push the four images, shards pull them, cleanup deletes this run's versions.
- **Fork path (registry-free):** skip GHCR login/push entirely; build with
  `apps/front/docker-compose.fork-overlay.yml`, which strips the four services'
  `cache_from`/`cache_to` (compose's `!reset` tag) because the gha cache backend needs both a
  writable destination and the Actions runtime credential a fork run does not get; save the
  four tagged images with `docker save | gzip`; hand them to each shard as a versioned
  artifact (`retention-days: 1`); each shard `docker load`s them locally so
  `up --no-build` resolves the same `${E2E_IMAGE_NS}-${service}:${E2E_IMAGE_TAG}` tags. The
  images never leave GitHub's infrastructure, and nothing is written to any registry.
- The `cleanup` job short-circuits to success on fork runs (`::notice::`, nothing pushed →
  nothing to delete) but keeps its `if: always()` aggregation role for the gate.

The gate aggregation (`front-e2e-gate`) is untouched: `needs.build.outputs.fork` only routes
steps inside jobs; job results, the matrix (`shard: [1, 2, 3, 4]`), and the required-check
name are identical on both paths, which is what makes a green fork run proof of the same work
a same-repo run performs.

## Partial re-run of failed `front-e2e` jobs (accepted, guarded)

Re-running only the **failed jobs** of a `front-e2e` run ("Re-run failed jobs") can **never**
succeed, no matter what caused the original failure — see issue #1063. The e2e images are
per-run scratch, tagged `${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}`, and the workflow's `cleanup`
job runs with `if: always()`, so it deletes them even when the shards failed (correct: nothing
should retain scratch images, and a partial re-run must not silently test the previous attempt's
build). A partial re-run does not re-run the `build` job, so the shards would pull the previous
attempt's tag, which no longer exists — the pull fails with `manifest unknown`, which looks like a
registry problem and sends you diagnosing the wrong thing (observed on PR #1056).

The `test` job's **"Detect partial re-run before pull"** step detects this *before* pulling: the
per-run tag always embeds the current attempt number, so comparing `needs.build.outputs.tag`
against `${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}` identifies a partial re-run (the build job was
not re-run, the tag is stale) and fails the job with an explicit "a full workflow re-run is
required" message. The only working retry is **"Re-run all jobs"**, which re-runs `build` and
pushes a fresh image set.

The guard's behavior is proven by `packages/scripts-ts/src/ci-e2e-rerun-guard.test.ts` (executes the real
`run:` body from the workflow against the fresh-run, full-rerun, and partial-rerun scenarios),
which runs in `just ci-drift` and server-side in `front-ci.yml::gate-selftest`.

## Runtime

Measured on a warm Linux checkout with warm docker layers. A cold run is
substantially slower — the first `ci-full` pays several minutes to build the e2e images.

| Target                  | Time    | Notes                                                                                  |
| ----------------------- | ------- | -------------------------------------------------------------------------------------- |
| `just ci`               | ~4m 20s | of which `just test-api` is ~1m 45s (1,158 tests)                                      |
| `just ci-e2e-front`     | ~8m 15s | 180 Playwright tests + the 107-test drawer-contrast Vitest source guard + docker stack |
| ~~`just ci-e2e-old-front`~~ | — | deleted 2026-08-22 (archived) |
| `just ci-full`          | ~21m    | the two e2e suites are ~80% of it                                                      |

That split is the reason `ci` and `ci-full` are separate targets: the everyday loop stays
in the 4-minute range, and you pay the 20 minutes only when frontend behaviour changed.

## Concurrency

All six workflows now set `concurrency` with `cancel-in-progress: true`. During
agent-driven work a PR can take many pushes, and without this every superseded run bills
in full while reviewing nothing. Keep the group keyed on `${{ github.ref }}` when adding a
workflow.
