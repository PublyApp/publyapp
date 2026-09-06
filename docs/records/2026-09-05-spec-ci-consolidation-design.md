# CI consolidation to 16 visible checks

**Status:** Approved design for issue #1699

**Date:** 2026-09-05

**Scope:** Pull-request, merge-queue, and `develop` push CI. Deployment image publication remains a separate push-only workflow.

## Goal

Reduce the pull-request check surface from the 41 check-runs observed on PR #2103 to exactly 16 visible jobs per central CI run, while preserving the four front Vitest shards, the four E2E shards, fail-closed relevance classification, required-check aggregation, complete report-all evidence for the ordered front non-Vitest chain, dependency-audit security semantics, API contract coverage, and E2E cleanup.

Every supported central run creates the same 16 check-runs. Irrelevant lanes complete with a successful, named sentinel step; they are not omitted and never finish as a GitHub `skipped` job. This makes the check shape stable for source changes, docs-only changes, merge groups, and `develop` pushes.

## Current diagnosis

The repository has nine workflow files. `deploy-images.yml` is push-only and is not part of the PR check count. The other eight workflows currently create seven independent `Determine changed paths` jobs and seven aggregate gates. `docs-archive.yml` also has an unrestricted `push:` trigger, so a push to a PR branch creates a second run and a second `docs-archive` result; this is the direct duplicate visible in PR #2103.

The exact PR #2103 rollup contained 41 check-runs. It included the following repeated or bookkeeping checks in addition to the actual product/test work:

- seven classifier jobs;
- seven gate jobs, including both `api-tests-gate` and the six contexts currently required by the GitHub ruleset;
- front supply-chain setup, a separate Vitest coverage job, a separate CI gate-selftest job, and four Vitest shard jobs;
- E2E build, four E2E shard jobs, and cleanup;
- duplicate `docs-archive` jobs from pull-request and unrestricted push runs.

The branch ruleset currently requires these six contexts: `front-e2e-gate`, `front-ci-gate`, `openapi-spec-drift-gate`, `docs-archive-gate`, `quality-gate`, and `react-doctor-gate`. `api-tests-gate` is not currently required even though #1462 added it as a CI workflow. The closure config is also stale: it lists five older contexts (`require-linked-issue`, OpenAPI, docs, front CI, front E2E) and omits quality and React Doctor.

## Target architecture

Create one PR CI workflow, `.github/workflows/ci.yml`, with these exact 16 visible check-runs:

| # | YAML job / matrix member | Display name | Execution contract |
|---:|---|---|---|
| 1 | `classify` | `CI classifier` | One base-pinned, fail-closed changed-file read. Emits one boolean output per lane. Always runs for `pull_request`, `merge_group`, and `push` to `develop`. |
| 2 | `verification` | `CI verification` | Always instantiated. One setup/install lane containing quality, docs, React Doctor, API path-filter coverage, structural self-tests, front non-Vitest/supply-chain checks, and the two unconditional tracked-file guards. Lane-owned steps use classifier outputs; a false lane emits a success sentinel. |
| 3 | `audit-development` | `Audit development dependencies` | Always instantiated. One real development-graph npm audit at the existing moderate threshold plus deterministic local fixture tests; an irrelevant lane runs only its success sentinel. |
| 4 | `audit-production` | `Audit production dependencies` | Always instantiated. One real production-graph npm audit at the existing moderate threshold plus deterministic local fixture tests; an irrelevant lane runs only its success sentinel. |
| 5 | `api` | `API contract and suite` | Always instantiated. OpenAPI/client drift checks and the full `just test-api` suite run when `api` is true; otherwise the lane emits its success sentinel. The path-coverage guard runs in `verification` unconditionally so it remains reachable when its own inputs change. |
| 6 | `front-vitest[1]` | `front-ci (1/4)` | Member 1 of the always-expanded `front-vitest` matrix, exact shard 1/4; false `front` uses the sentinel step. |
| 7 | `front-vitest[2]` | `front-ci (2/4)` | Member 2 of the always-expanded `front-vitest` matrix, exact shard 2/4; false `front` uses the sentinel step. |
| 8 | `front-vitest[3]` | `front-ci (3/4)` | Member 3 of the always-expanded `front-vitest` matrix, exact shard 3/4; false `front` uses the sentinel step. |
| 9 | `front-vitest[4]` | `front-ci (4/4)` | Member 4 of the always-expanded `front-vitest` matrix, exact shard 4/4; false `front` uses the sentinel step. |
| 10 | `e2e-build` | `Build e2e images` | Always instantiated. Builds the run-scoped images when `e2e` is true and exposes the tag/fork outputs; otherwise it emits empty, explicitly non-applicable outputs and its success sentinel. |
| 11 | `e2e-test[1]` | `front-e2e (1/4)` | Member 1 of the always-expanded `e2e-test` matrix, exact shard 1/4; false `e2e` uses the sentinel step. |
| 12 | `e2e-test[2]` | `front-e2e (2/4)` | Member 2 of the always-expanded `e2e-test` matrix, exact shard 2/4; false `e2e` uses the sentinel step. |
| 13 | `e2e-test[3]` | `front-e2e (3/4)` | Member 3 of the always-expanded `e2e-test` matrix, exact shard 3/4; false `e2e` uses the sentinel step. |
| 14 | `e2e-test[4]` | `front-e2e (4/4)` | Member 4 of the always-expanded `e2e-test` matrix, exact shard 4/4, including the existing once-only browser guard; false `e2e` uses the sentinel step. |
| 15 | `e2e-cleanup` | `Clean up e2e images` | Always runs after build/test, keeps `packages: write` isolated from the final gate, and fails closed on an unsafe or unsuccessful cleanup decision. It uses its success sentinel when E2E is non-applicable. |
| 16 | `gate` | `ci-final-gate` for PR/merge-group, `ci-push-check` for develop push | The only aggregate gate and the only externally required context. It downloads the exact upstream result artifacts, validates every upstream result and matrix member, reads live PR state for PR events, applies the linked-issue policy, and runs its own structural guard. |

The four front and four E2E rows are matrix members, not eight copied YAML definitions. GitHub expands both matrices on every run, so they are eight visible shard check-runs. There is no separate front coverage, gate-selftest, docs gate, React gate, OpenAPI gate, API gate, or linked-issue check-run.

### Stable topology proof and matrix choice

The recommended implementation is an always-expanded matrix with step-level conditions, not eight explicit shard jobs. The matrix axes are literal and immutable: `front-vitest.matrix.shard: [1, 2, 3, 4]` and `e2e-test.matrix.shard: [1, 2, 3, 4]`, both with `fail-fast: false`. Every central job is instantiated with `if: always()` where it has dependencies; no central job uses a relevance-dependent job-level `if`. Each lane begins with a classifier-result check. A successful classifier plus `false` lane output runs exactly one `CI lane not applicable` sentinel and skips only the expensive steps. A classifier failure fails the lane; it is never converted into non-applicability. The gate rejects any central job whose result is `skipped`.

Every upstream job writes one run-scoped `ci-lane-result` artifact from an `if: always()` collector. Independent checks in a packed job use `if: always()` and `continue-on-error: true` only to record all diagnostics; the final collector is not `continue-on-error` and exits non-zero when any recorded check failed. Matrix shards use the same collector and unique artifact key (`front-vitest/1..4` or `e2e-test/1..4`), so a red shard cannot suppress later shards or teardown.

These artifacts are data contracts for the reducer, not additional GitHub jobs or check-runs; they do not change the visible count of 16.

Each `ci-lane-result` artifact contains exactly one JSON record with this shape:

```json
{
  "schema_version": 1,
  "run_id": 123,
  "run_attempt": 1,
  "event_sha": "<GITHUB_SHA>",
  "job": {
    "key": "front-vitest/2",
    "id": "front-vitest",
    "matrix": {"shard": 2},
    "lanes": {
      "front": {
        "mode": "relevant",
        "expected_steps": ["front.checkout", "front.install", "front.vitest"],
        "steps": [
          {"id": "front.checkout", "execution": "executed", "outcome": "success"},
          {"id": "front.install", "execution": "executed", "outcome": "success"},
          {"id": "front.vitest", "execution": "executed", "outcome": "success"}
        ]
      }
    }
  }
}
```

Every lane has an explicit `expected_steps` set and one `steps` record for every expected ID. `execution` is `executed` or `skipped`; `outcome` is `success`, `failure`, `cancelled`, or `skipped`, with `execution: skipped` requiring `outcome: skipped`. The collector runs with `if: always()` and records the outcome and execution state of every workflow step, including steps skipped by a classifier sentinel or after a failed step. The reducer requires exact set equality (no missing, duplicate, or unknown step IDs) before it evaluates outcomes. A relevant lane must execute its complete set; a sentinel lane must execute exactly its sentinel while recording every expensive step as skipped. The `job.key` set is exactly `classify`, `verification`, `audit-development`, `audit-production`, `api`, `front-vitest/1`, `front-vitest/2`, `front-vitest/3`, `front-vitest/4`, `e2e-build`, `e2e-test/1`, `e2e-test/2`, `e2e-test/3`, `e2e-test/4`, and `e2e-cleanup`. The reducer rejects unknown, duplicate, missing, cross-run, or malformed records and emits one machine-readable aggregate result with `ok`, `expected_keys`, `observed_keys`, and `failures`; a non-empty `failures` array makes the gate fail.

The first failing command does not erase later evidence: every independent workflow step has an `if: always()` collector path, and a fixture with the first command red and every following command recording its own outcome must remain complete while the aggregate stays red. A structure mutation that removes `always()` from a required step or changes a required step to an unconditional skip is rejected before CI can publish the workflow.

### Front non-Vitest report-all contract (#1699)

The current `apps/front/package.json` `test:ci-non-vitest` value is a 30-command `&&` chain. Its first failure prevents commands 2–30 from running, so merely moving that string into `verification` would violate the artifact contract above. PR A therefore changes the script to the exact wrapper `node scripts/run-guarded.mts scripts/ci/run-non-vitest-report-all.mts`, preserving the script name while replacing the fail-fast implementation with `apps/front/scripts/ci/run-non-vitest-report-all.mts`, and adds `run-non-vitest-report-all.test.mts`.

The durable runner owns one ordered, explicit command manifest equal to the current chain, in this exact order:

```text
1  pnpm check:guard-coverage
2  node scripts/run-guarded.mts --test scripts/ci/compose-startup.test.mts
3  pnpm test:e2e-compose-env
4  pnpm test:route-tree-guard
5  pnpm test:design-guards
6  pnpm test:request-counter
7  pnpm test:search-cancel-css
8  pnpm test:context-chunk-isolation
9  pnpm test:simplebar-upstream-css
10 pnpm test:design-system-guard
11 pnpm test:zindex-guard
12 pnpm test:react-compiler-guard
13 pnpm test:shared-ts-import-paths
14 pnpm test:e2e-shared-constants-guard
15 pnpm test:column-type-imports-guard
16 pnpm test:server-static-imports-guard
17 pnpm test:font-bundle
18 pnpm test:shared-ts-node-resolution
19 pnpm check:design-system
20 pnpm check:zindex
21 pnpm check:react-compiler
22 pnpm check:shared-ts-import-paths
23 pnpm check:shared-ts-node-resolution
24 pnpm check:e2e-shared-constants
25 pnpm test:typecheck-coverage-guard
26 pnpm test:guard-coverage-guard
27 pnpm check:column-type-imports
28 pnpm check:server-static-imports
29 pnpm test:runtime-env-startup
30 pnpm test:front-runtime-image-guard
```

The runner invokes each command without a shell, records `{id, argv, execution, outcome, exit_code, signal}` in order, continues after every non-zero result, writes the nested `front.non-vitest` lane report consumed by `ci-lane-result`, and exits non-zero after the complete report if any command failed. This is one step bundle inside the existing `verification` check; the nested command records are artifacts and do not add visible check-runs. `pnpm` resolution is platform-aware (`pnpm.cmd` on Windows). Its test uses a fake command runner with command 1 failing and commands 2–30 succeeding/failing in known positions, then asserts all 30 records, exact order, preserved exit diagnostics, and non-zero final status. A second mutation test removes one command from the manifest and fails on expected-set inequality. This is the selected durable report-all solution; the issue's alternative prefix-only option is not used.

This option is clearest because one matrix declaration is the source of truth for shard count and the step conditions make the stable-check contract visible beside the expensive commands. Eight explicit jobs would also work, but would duplicate shard wiring and create eight independent drift points without reducing the visible count.

The count is proven with two static workflow fixtures and one runtime contract test:

| Fixture | Classifier result | Expected visible check-runs |
|---|---|---:|
| source PR changing `apps/front/src/**` | `front=true`, `e2e=true`, other lane values according to the table | exactly 16; all four front and all four E2E members execute |
| docs-only PR changing `docs/guides/**` | `front=false`, `api=false`, `e2e=false`; unrelated verification/docs lanes remain classified normally | exactly 16; front/E2E/API/build/cleanup use success sentinels, with no `skipped` result |

The structure test parses the real workflow and both fixtures. It fails if a matrix axis is shortened, an `include`/`exclude` changes expansion, `fail-fast` is not `false`, a relevance condition moves to the job level, a sentinel is removed, a collector or independent check step is not `if: always()`, a final collector is `continue-on-error`, the report-all runner is replaced by a fail-fast `&&` chain, or the display-name set no longer has exactly the 16 labels above. The bootstrap/aggregation tests download fixture result artifacts and assert the exact upstream key set, including all eight matrix members; they additionally prove that a classifier failure cannot produce a green sentinel gate. This is the source/docs-only proof without running browser or API suites.

### Exact permissions matrix

The workflow starts with `permissions: {}`. Every job declares exactly the following allowlist; no job inherits a broader workflow default and no job may use `write-all`:

| Job | Exact `GITHUB_TOKEN` permissions |
|---|---|
| `classify` | `contents: read`, `pull-requests: read` |
| `verification` | `contents: read` |
| `audit-development` | `contents: read` |
| `audit-production` | `contents: read` |
| `api` | `contents: read` |
| `front-vitest` | `contents: read` |
| `e2e-build` | `contents: read`, `packages: write` |
| `e2e-test` | `contents: read`, `packages: read` |
| `e2e-cleanup` | `contents: read`, `packages: write` |
| `gate` | `actions: read`, `contents: read`, `issues: read`, `pull-requests: read` |

The matrix rows inherit the permission block of their YAML job. `packages: write` exists only on image build and cleanup; the final gate never receives it. The deploy workflow keeps its existing independent `contents: read` plus `packages: write` permission because it is outside this 16-check topology. The structure test mutates this map by adding a write scope, dropping a required read scope, or moving package write to another job and must fail each mutation.

### Workflow triggers and duplicate prevention

`ci.yml` declares exactly:

```yaml
on:
  pull_request:
    types: [opened, edited, reopened, synchronize, ready_for_review]
  merge_group:
  push:
    branches: [develop]
```

It has no `paths` or `paths-ignore` filter and no body-specific trigger restriction. The explicit PR activity list includes `edited` for linked-issue/body changes and `ready_for_review` for draft-to-ready transitions; `synchronize` covers a new head SHA, while `opened` and `reopened` cover initial/reopened review. The classifier decides lane relevance after the workflow exists, so the final gate is created on every supported PR and merge-group event. The `push` event is retained for broken-`develop` detection from #1920, but its gate reports `ci-push-check`, never `ci-final-gate`.

There is no `workflow_dispatch`, schedule, or unrestricted branch push trigger in this gate workflow. This preserves the #1017 rounds 5/6 protection against a second report of the required context for the same commit. The old unrestricted `docs-archive.yml` push trigger disappears with the old workflow.

## Classifier interface

`classify` is the only job that queries changed files. It checks out `packages/scripts-ts/src/ci-changed-paths.ts` from the pull request base commit, reads the PR file list and reported `changed_files` total once, and evaluates a versioned lane-pattern table in one invocation.

The classifier emits these exact outputs, each as the string `true` or `false`:

```text
quality
front
api
e2e
docs
react
```

The `quality` lane includes every source/config path that can affect repository quality and all `.github/workflows/**` paths. The `front` lane covers the shipped front app and its shared/client/config inputs. The `api` lane covers API, AppHost, client contract, .NET build/tool, and API workflow inputs. The `e2e` lane covers the E2E image, compose, front runtime, and E2E workflow inputs. The `docs` lane covers docs/archive inputs and root navigable Markdown. The `react` lane covers the React Doctor source and configuration inputs.

The lane table is the single source of truth for the central workflow. The push trigger paths are not a second classifier: push and merge-group events run every lane by construction.

Fail-closed rules are mandatory:

1. A `pull_request` event with a missing, malformed, non-array, truncated, or count-mismatched file response sets every lane to `true` and reports the reason. It never guesses `false`.
2. A `merge_group` event sets every lane to `true` without attempting a pull-request file query.
3. A `push` event sets every lane to `true` because the workflow intentionally has no path filter.
4. The job fails if any expected lane output is absent or has a value other than the literal `true` or `false`.
5. Downstream jobs cannot treat a classifier failure as an irrelevant change. The final gate rejects a classifier result other than `success`.

## Final gate contract

`gate` has `if: always()` and needs `classify`, `verification`, `audit-development`, `audit-production`, `api`, `front-vitest`, `e2e-build`, `e2e-test`, and `e2e-cleanup`. `needs` is only the DAG barrier; it is not a matrix-member inspection mechanism. The two matrix job ids are `front-vitest` and `e2e-test`, and their four members are represented by the run-scoped result artifacts collected by the gate.

For a `pull_request` event, its first policy step reads the live PR through `gh pr view --json headRefOid,baseRefName,potentialMergeCommit,body,isDraft` using the gate token and obtains the current `headRefOid`, `baseRefName`, `potentialMergeCommit.oid`, body, and draft state. It captures `event_sha` exclusively from the job's `$GITHUB_SHA`; it never derives that value from REST `actions/runs.head_sha`. It also reads `gh api repos/<owner>/<repo>/actions/runs/$GITHUB_RUN_ID` for the run's path, numeric workflow ID, workflow action/event, run ID, attempt, and `head_sha`. The live PR's `potentialMergeCommit.oid` must be non-null and equal to the job's `$GITHUB_SHA`; a stale event, base advance, base-ref change, or merge-ref mismatch fails closed. It evaluates the linked-issue relationship from the live body, never from a possibly stale webhook payload. It then writes a canonical snapshot artifact containing `pr_number`, `head_sha`, `base_ref_name`, `potential_merge_commit_oid`, `body_sha256`, `is_draft`, `event_name`, `event_sha`, `workflow_path`, `workflow_id`, `workflow_action`, `run_id`, and `run_attempt`. The snapshot is accepted only when the workflow-run API reports the same path, workflow ID, action/event, run ID, attempt, and `head_sha == headRefOid`; separately, `snapshot.event_sha` must equal the live `potentialMergeCommit.oid`. REST `run.head_sha` is never compared to `snapshot.event_sha`. Any mismatch is `UNVERIFIED`. Comments and labels are deliberately absent from this snapshot because they do not affect the linked-issue policy and do not trigger this workflow; a future label-based policy must add the label fingerprint and trigger before becoming authoritative. A non-PR event reports an explicit non-applicable success and does not produce PR closure evidence.

Its aggregation step then requires:

- `classify.result == success`;
- every central parent job to report `success` and every expected upstream result artifact to exist exactly once;
- a `true` lane to have its real commands execute and succeed, and a `false` lane to have exactly its success sentinel execute;
- all four front Vitest shards and all four E2E shards to be present in the matrix expansion;
- no failed, cancelled, unknown, or `skipped` central result; a skipped result is an invalid topology, even for an irrelevant lane;
- the classifier outputs used by the decision to be present and literal;
- the live-PR snapshot artifact to match the current head/base/merge/body/draft state, event `GITHUB_SHA`, and central workflow identity for a PR run;
- the exact 15 upstream result records to have the expected job/matrix key, conclusion, lane mode, and run identity.

The gate downloads result artifacts with `actions/download-artifact` and invokes `packages/scripts-ts/src/check-ci-gate-aggregation.ts`. That script owns the expected upstream key set; it does not use `${{ toJSON(needs) }}` to inspect matrix members. Missing, duplicate, malformed, stale-run, or failed records fail closed. The gate job name uses an allowlist expression: only `pull_request` and `merge_group` resolve to `ci-final-gate`; every other supported event resolves to `ci-push-check`. The structural guard rejects any additional trigger event or another job claiming either name. A `pull_request` run is authoritative only for its exact live `headRefOid`; a result for an earlier SHA or a `develop` push cannot satisfy PR closure.

### PR closure contract and duplicate-result scenarios

The closure adapter consumes one explicit contract. During PR A, `.ai/project-closure-v1.json` declares the six old ruleset contexts plus the new gate, in this exact order:

```json
{
  "ci_required_checks": [
    "front-e2e-gate",
    "front-ci-gate",
    "openapi-spec-drift-gate",
    "docs-archive-gate",
    "quality-gate",
    "react-doctor-gate",
    "ci-final-gate"
  ],
  "ci_live_pr_checks": ["ci-final-gate"],
  "ci_required_checks_source": {
    "pull_request": "candidate_tip",
    "merge_group": "event_tip",
    "push": "event_tip"
  },
  "ci_live_pr_workflow": {
    "path": ".github/workflows/ci.yml",
    "action": "pull_request"
  }
}
```

The old six remain closure-authoritative during PR A, but only the new gate is in `ci_live_pr_checks` because the old workflows do not all rerun on body edits. After the atomic ruleset cutover, PR B changes `ci_required_checks` to `["ci-final-gate"]` and keeps `ci_live_pr_checks` as `["ci-final-gate"]`, while retaining the same explicit source and workflow identity contract. The shared schema validates that `ci_live_pr_checks` is a duplicate-free subset of `ci_required_checks`, that PR checks use `candidate_tip`, and that the live central workflow path/action are fixed. The GitHub PR metadata and the final gate supply the live PR head/base/merge/body/draft snapshot; the GitHub REST commit check-run collection for that exact head is the authoritative result source:

For a PR closure read, `candidate_tip` is not an advisory label or an environment override. The shared CLI resolves the live `headRefOid`, fetches `.ai/project-closure-v1.json` with `ref=<headRefOid>` through the GitHub Contents API, and verifies the returned blob SHA against the same path in `git/trees/<headRefOid>` before parsing it. It never falls back to the checked-out default-branch file or accepts `PR_CLOSURE_CONFIG`/another hidden override. For `merge_group` and `push`, the explicit `event_tip` mapping reads the checked-out config at the event SHA. Therefore the canonical `develop` config cannot approve PR B's removal of old producers: PR B must prove its one-gate config from its own reviewed tip before the ruleset cutover is used.

```text
gh api --paginate --slurp \
  "repos/<owner>/<repo>/commits/<headRefOid>/check-runs?filter=all&per_page=100"
```

The `filter=all` query and pagination are mandatory; the default latest-only result is forbidden. The PR GraphQL `statusCheckRollup` remains useful diagnostic context, but it is not used to choose a required result because it can contain historical same-name runs without a reliable current-run ordering. The commit endpoint records each check run's `id`, `name`, `head_sha`, `status`, `conclusion`, `started_at`, `completed_at`, `details_url`, `app.slug`, and `check_suite.id`; these fields are the minimum provenance record. A candidate must have the exact head SHA, `app.slug == "github-actions"`, a non-empty check-suite identity, and a `details_url` that resolves to one Actions workflow-run ID. Resolve the expected numeric workflow ID from the configured `.github/workflows/ci.yml` path, then require the resolved workflow run to identify that exact path and ID, action/event `pull_request`, `run_attempt`, and `head_sha == headRefOid`. The run API identity is checked separately from the snapshot's event SHA: only the snapshot value captured from the job's `$GITHUB_SHA` is compared to live `potentialMergeCommit.oid`. A same-name candidate from another app, a missing provenance field, an unparseable run URL, a head/base/merge/event/workflow mismatch, or a head mismatch makes that required name `UNVERIFIED` even when another same-name candidate is green; it is never silently filtered away. `ci-push-check` is not in the PR required list and can never satisfy PR closure.

The shared `pr-closure` implementation must apply this deterministic algorithm for every required name:

1. Resolve the explicit `candidate_tip` closure config at the live `headRefOid`, then read live PR metadata (`headRefOid`, `baseRefName`, `potentialMergeCommit.oid`, body, and draft state). Fetch all pages of commit check-runs for that exact head with `filter=all`; do not derive an event SHA from REST `run.head_sha` or a check-run head. Require a non-null `potentialMergeCommit.oid`; the selected run's snapshot must bind the job-captured event SHA to it in step 4. A base advance, base-ref change, merge-ref mismatch, or stale rerun returns `UNVERIFIED`. Do not use generic PR mutation timestamps, comment timestamps, label timestamps, or rollup array order as an event barrier.
2. Validate every same-name candidate for a required context. Each candidate must have the exact head, GitHub Actions app, check-suite identity, check-run ID, parseable Actions workflow-run ID, central workflow path, workflow ID, workflow action/event, run attempt, and workflow-run `head_sha == headRefOid`. The candidate's event SHA is not taken from workflow-run `head_sha`; it is read only from the selected run's snapshot artifact and checked against live `potentialMergeCommit.oid`. If any same-name candidate in the exact-head collection has another app or missing/invalid provenance, return `UNVERIFIED` for that required name even if a different candidate is green.
3. Select the unique latest candidate by `(started_at, completed_at-or-minimum, check_run_id)`. If candidates tied for the greatest `started_at` belong to different check suites, return `UNVERIFIED` (`ambiguous concurrent runs`). A selected non-completed run remains `UNVERIFIED`; a selected completed failure is `CI_RED`; only a selected completed `SUCCESS` is passing evidence.
4. For each name in `ci_live_pr_checks`, resolve the selected workflow-run ID's artifact `ci-pr-snapshot-<run_id>-<run_attempt>`. The artifact is a small JSON record written by `ci-final-gate` after it reads the live PR; its `event_sha` is copied from that job's `$GITHUB_SHA`. It contains `pr_number`, `head_sha`, `base_ref_name`, `potential_merge_commit_oid`, `body_sha256`, `is_draft`, `event_name`, `event_sha`, `workflow_path`, `workflow_id`, `workflow_action`, `run_id`, and `run_attempt`. Re-read the live PR and require exact equality of head, base ref, potential merge commit, body hash, draft state, workflow path/ID/action, run ID, and attempt, plus `snapshot.event_sha == live potentialMergeCommit.oid`; do not compare `snapshot.event_sha` to REST `run.head_sha`. Missing, duplicate, malformed, stale, or mismatched snapshot evidence is `UNVERIFIED`, even when the selected check is green.
5. The freshness window is therefore event/run-linked: after a body edit, draft transition, base advance, or base-ref change, the old gate artifact has a different body/base/merge/draft/event fingerprint and cannot pass. Closure remains `UNVERIFIED` until a new run with a matching live snapshot is present. A comment or label change that does not change the body, head, base, merge, or draft state does not invalidate the old evidence because it is outside the central policy; labels are not silently treated as an event barrier. An old rerun whose event `GITHUB_SHA` or workflow metadata no longer matches live state is also `UNVERIFIED`.
6. Bind the selected record's `head_sha`, `check_run_id`, `workflow_run_id`, `base_ref_name`, `potential_merge_commit_oid`, `event_sha`, workflow identity, and snapshot fingerprint into `CiFacts` evidence. A later status read repeats the algorithm, so a stale rerun, base change, or head change cannot reuse an earlier green result.

The shared change is explicit and testable. In `/home/radan/ai-orchestration-playbook`, modify `tools/pr_closure/model.py` to carry check-run provenance (`check_run_id`, `head_sha`, `started_at`, `completed_at`, `app_slug`, `check_suite_id`, `workflow_run_id`) plus live PR base/merge identity, run workflow identity, and snapshot identity including the job-provided event SHA; modify `tools/pr_closure/contract.py` and `tools/schemas/project-closure-v1.json` to validate the `ci_live_pr_checks` subset, the explicit `ci_required_checks_source` mapping, and the fixed live workflow path/action; modify `tools/pr_closure/sources.py` to fetch candidate-tip config at the live head, fetch `filter=all` commit check-runs, resolve workflow-run IDs, validate workflow path/ID/action/run attempt and `run.head_sha == headRefOid`, download/validate the run-scoped snapshot artifact, and compare only `snapshot.event_sha` to live `potentialMergeCommit.oid`; modify `tools/pr_closure/cli.py` to read live PR state and enforce candidate-tip binding before `classify_ci`. Update `.ai/orchestration-adapter.md`'s `ci_status_cmd` contract to include `baseRefName` and `potentialMergeCommit` and to name the candidate-tip source policy. Add focused tests in `tools/tests/test_sources.py`, `tools/tests/test_cli.py`, and `tools/tests/test_schema_agreement.py`; do not reimplement this selection in PublyApp. `packages/scripts-ts/src/project-closure-adapter.test.ts` verifies the PR A seven-context config, the PR B one-context config, candidate-tip-vs-develop resolution, and the shared live-snapshot contract.

The adapter and aggregation tests must cover these event sequences:

| Sequence | Required closure result |
|---|---|
| invalid body → `edited` → valid body, same head | The old gate's snapshot body hash mismatches the live body, so it is `UNVERIFIED`. The fresh run reads the live body, writes a matching snapshot, remains `UNVERIFIED` while pending, and becomes green only after `SUCCESS`. |
| valid body → `edited` → invalid body, same head | The earlier green snapshot mismatches the live body and cannot remain green. The fresh gate reads the invalid live body and is `CI_RED`; a rerun carrying a stale event payload also fails because the gate compares live head/body before writing its snapshot. |
| draft → `ready_for_review`, same head | The old snapshot has `is_draft: true` and is rejected after the live PR becomes ready. Closure waits for a fresh `ready_for_review` run with `is_draft: false`. |
| head A → `synchronize` → head B | The commit endpoint is queried for B; every A run is excluded by `head_sha`, even if its name and conclusion are green. |
| base B1/merge M1 → base advances or base ref changes → base B2/merge M2, same head | The old snapshot's `base_ref_name`/`potential_merge_commit_oid`/`event_sha` no longer match live state and is `UNVERIFIED`; only a fresh run carrying M2 and the current base metadata can pass. |
| Realistic PR run binding | The check-run/workflow-run API fixture has `run.head_sha == live headRefOid`; the gate artifact has `snapshot.event_sha == live potentialMergeCommit.oid` (the job's original `$GITHUB_SHA`). Closure accepts that pair and never requires `run.head_sha == snapshot.event_sha`. |
| comment or label change without a central trigger | No body/head/base/merge/draft fingerprint changes, so the latest valid gate snapshot remains usable. The algorithm never treats generic PR timestamps as evidence that a new gate is required. |
| old workflow rerun after a body edit or base advance | The rerun is accepted only if its gate reads the current live PR and workflow metadata and uploads a matching snapshot; a rerun that preserves an old payload, old event `GITHUB_SHA`, old merge ref, or lacks the snapshot is `UNVERIFIED`. |
| two same-name runs after one event | Different latest check-suite IDs are `UNVERIFIED` as ambiguous; one unique latest suite is selected deterministically by timestamps and check-run ID. |
| central PR run plus develop push run | Only the exact-head `ci-final-gate` is authoritative; `ci-push-check` is ignored for closure, so the two names cannot create duplicate evidence for one PR. |

The duplicate-result fixtures must include old green + new pending, old green + new red, old red + new green, old snapshot + changed body, old draft + ready PR, the realistic `run.head_sha == headRefOid`/`snapshot.event_sha == potentialMergeCommit.oid` pair, base advance/merge-ref change, base-ref change, comment/label-only updates, old workflow rerun with stale payload or stale event `GITHUB_SHA`, concurrent same-start runs from different suites, a head-mismatched run, a green same-name run from another app, a green same-name run with missing provenance, a workflow path/ID/action mismatch, and a develop `ci-push-check`. Each fixture asserts the selected `check_run_id`/`workflow_run_id` or the exact `UNVERIFIED` reason; there is no “latest array element wins” behavior.

The final gate runs `check-ci-gate-structure.ts` directly as one of its own steps. `verification` runs the deterministic guard-test bundle once; the final gate does not rerun the bundle. This retains the direct self-check from the #1017 round-5 fix while removing the separate `gate-selftest` check-run.

## Preserved invariants and their owners

| Invariant | Owner after consolidation | Proof that must remain |
|---|---|---|
| Required context always reports | `gate` | `if: always()`, allowed triggers, event-specific names, needs aggregation tests |
| No second producer of a required context | `check-ci-gate-structure.ts` | Whole-repository reserved-name scan, exact `ci-final-gate` owner |
| Classifier cannot certify incomplete file evidence | `classify` | Existing count comparison and truncation tests, expanded to the lane map |
| Every lane is evaluated when relevant | classifier outputs + final gate | Per-lane true/false aggregation matrix and missing-output failures |
| Front Vitest suite is four complete shards | `front-vitest` + `verification` | Exact `[1,2,3,4]` matrix pin and real `vitest list` union equality |
| E2E suite is four complete shards | `e2e-test` + structure guard | Exact `[1,2,3,4]` matrix pin and existing Playwright shard coverage |
| API architecture/DI/security specs run in CI | `api` | Full `just test-api` invocation and API path coverage guard |
| API path coverage guard is reachable on its own inputs | `verification` | Unconditional invocation and `check-api-tests-path-coverage` tests reading `ci.yml` |
| Production/development npm audits fail closed | two audit jobs | One live invocation per graph; deterministic fixture tests; unavailable service remains red |
| No force-added ignored files | `verification` | Unconditional `check-no-ignored-tracked` step |
| No `.dockerignore` shadow | `verification` | Unconditional `check-dockerignore-shadow` step |
| Docs link/prune inventory remains enforced | `verification` docs step | `docs` lane pattern and existing fixture tests |
| React Doctor remains a hard gate on changed front files | `verification` React step | `react` lane pattern, full-history checkout, blocking warnings |
| PR links an existing issue | `gate` policy step | Existing relationship parser and GitHub closing-reference verification |
| PR closure cannot reuse a stale or duplicate same-name result | shared `pr-closure` source reader + live gate snapshot | candidate-tip config binding, `filter=all` commit check-runs, exact head/base/merge/event binding, workflow path/ID/action, body/head/draft fingerprint, check-suite/workflow-run identity, snapshot artifact, duplicate/provenance tests |
| E2E images cannot leak or be deleted unsafely | `e2e-cleanup` | Existing cleanup script/specs, `if: always()`, separate package permission |
| Local/hosted CI correspondence remains visible | drift manifest | Content hashes, removal confessions, and updated local guide |

The API suite remains one visible job in this 16-check topology. A four-way API matrix would add four visible checks and produce a 19-check topology before any other isolation changes; stable class-hash sharding from #1947 is therefore a separate performance change after this check-surface consolidation, with its own count decision and union proof.

### Bespoke assertion admission analysis

This is a clarification of the already owner-ratified full CI consolidation design, not a new topology decision. The existing design names the exact 16-check topology, permissions, trigger contract, artifact contract, fail-closed reducer, and ordered 30-command front inventory. The central structural/artifact/manifest assertions make those already-approved invariants executable. No fresh owner signature is inferred from this clarification.

The six admission conditions for retaining that existing assertion set are:

1. **Exact prohibited defect:** drift may remove a central job or matrix member, add a second producer, widen permissions, filter a stable trigger, merge artifact containers, detach an observed filename from its record, weaken the reducer or tolerated diagnostics, or omit/reorder one of the 30 front report-all commands while ordinary tests still pass.
2. **Why standard tools and ordinary behavior tests are insufficient:** YAML/schema validation accepts valid but unsafe topology, permissions, trigger filters, matrices, and step conditions. Ordinary command tests do not observe GitHub job instantiation, required-check reporting, hosted artifact container boundaries, producer identity, or whether an unrelated workflow can claim the same context. A local command runner also cannot prove the workflow's hosted provenance and event wiring.
3. **Meaningful failure demonstrated:** the reviewed counterexamples include 41 visible checks instead of 16, 3 of 39 topology mutations escaping the earlier guard, swapped valid API/verification artifact contents passing, flat `ci-e2e-*` inputs missing from classification, failure-only diagnostics becoming unreachable after tolerated failures, filtered triggers suppressing a stable gate, and the 30-command inventory losing coverage without an ordinary test failure.
4. **Smallest scope:** keep the assertions in the existing `check-ci-gate-structure.ts`, the existing artifact/reducer/classifier/drift/report tests, and the existing central workflow manifest. They inspect only the central workflow, its owned contracts, and the already-required local mirrors; no new workflow job or unrelated repository-wide policy is introduced.

The API path-coverage correction is ordinary behavior evidence: `findPathCoverageProblems(rootDir)` runs against the real tree and representative workflow/path fixtures. The removed `readCentralApiCoverageSurface()` reachability helper and its guard-policing test are not part of the admission case. Hosted reachability remains owned by the existing workflow and required-context mechanism; no decoy-sensitive string reachability assertion is retained.

5. **Maintenance cost and owner:** the CI consolidation/local-gate maintainers own the guard and its pinned tables. A workflow topology, permission, trigger, artifact, reducer, diagnostic, classifier, or front-command change must update the corresponding expectation, fixture, manifest mirror/reason, and focused mutation test in the same review. This is an explicit review cost, bounded by the 16 jobs, 15 upstream artifact records, and 30-command manifest.
6. **Retirement/replacement condition:** do not retire these assertions in PR A. They may be removed or narrowed only after PR B completes the old-producer removal and ruleset cutover, and an owner-authorized replacement proves the same stable required-context, producer-identity, permission, trigger, artifact-boundary, fail-closed reducer, diagnostic, and command-inventory invariants with equivalent hosted and local evidence. A future replacement must be recorded as a new design decision rather than silently weakening this one.

The manifest's per-step mirror/reason reconciliation is part of the existing drift-manifest contract, not a second bespoke policy assertion: local commands are named when they actually cover the hosted execution, and GitHub-only orchestration receives a specific reason for its exemption.

## Workflow migration

The consolidated workflow eventually replaces these PR workflows:

- `.github/workflows/api-tests.yml`;
- `.github/workflows/docs-archive.yml`;
- `.github/workflows/front-ci.yml`;
- `.github/workflows/front-e2e.yml`;
- `.github/workflows/openapi-spec-drift.yml`;
- `.github/workflows/quality-gate.yml`;
- `.github/workflows/react-doctor.yml`;
- `.github/workflows/require-linked-issue.yml`.

`.github/workflows/deploy-images.yml` remains unchanged and push-only.

The migration is a relocation of existing steps and guards, not a removal of their assertions. It is split into two implementation PRs so the old producers are intentionally retained during PR A and removed only in PR B after the ruleset cutover. PR A is allowed to leave the old workflow files capable of producing the six old contexts; PR A must not delete or rename them. PR A's candidate-tip closure config names the six old contexts plus `ci-final-gate`, with only `ci-final-gate` requiring the live-PR snapshot; the unchanged external ruleset independently requires the six old contexts for merge. The final state, after PR B, has no old producer and both authorities name only the central gate. No PR may claim that old gate removal is safe merely because a central gate passed on a merged `develop` commit: the external ruleset cutover and PR B candidate-tip config are explicit prerequisites for PR B.

## Exact repository changes

The implementation is split into these non-contradictory repository slices:

1. **PR A — additive central workflow:** create `.github/workflows/ci.yml`; update the classifier, structure guard, aggregation/bootstrap tests, API reachability tests, shard/artifact contracts, durable front report-all runner/test, central-workflow manifest, local mirror, and documentation to describe the central workflow; keep all eight replaced PR workflows and `deploy-images.yml` unchanged. Set `.ai/project-closure-v1.json` `ci_required_checks` to the six old contexts plus `ci-final-gate`, `ci_live_pr_checks` to `["ci-final-gate"]`, `ci_required_checks_source` to the explicit `candidate_tip`/`event_tip` mapping, and `ci_live_pr_workflow` to the fixed central path/action. The old external ruleset remains independently authoritative for the six old contexts; this is a deliberate dual-authority interval, not a weaker merge rule. Do not add removal confessions because no old step is removed in PR A.
2. **Shared prerequisite — closure provenance:** update and test the shared `/home/radan/ai-orchestration-playbook` closure reader before PR A is accepted. The exact files and algorithm are specified in the closure section below. PublyApp's `project-closure-adapter.test.ts` must exercise the shared reader's same-head/fresh-run contract; no local adapter may reimplement check-run selection.
3. **PR B — removal after cutover:** remove the eight replaced PR workflows and their obsolete required-context producers; change the candidate-tip `.ai/project-closure-v1.json` to `ci_required_checks: ["ci-final-gate"]` and keep `ci_live_pr_checks: ["ci-final-gate"]`, the explicit source mapping, and the fixed central workflow identity; remove obsolete path-contract references and record every removed step in the drift ratchet with its new central owner. Keep `deploy-images.yml` unchanged.

The two-PR split is mandatory: classifier, structure, aggregation, and documentation changes are reviewed in additive PR A; deletion and final closure-list changes are reviewed in removal PR B after the external cutover.

The PR A file set includes these concrete groups:

- **Classifier:** `packages/scripts-ts/src/ci-changed-paths.ts` and `packages/scripts-ts/src/ci-changed-paths.test.ts` for one file fetch and lane outputs.
- **Structure:** `packages/scripts-ts/src/check-ci-gate-structure.ts` and `packages/scripts-ts/src/check-ci-gate-structure.test.ts` from a seven-workflow gate table to one central graph, retaining whole-repository collision scanning, trigger allowlisting, direct self-check, matrix pins, pinned test files, and gate self-test pins.
- **Aggregation/bootstrap:** add `packages/scripts-ts/src/check-ci-gate-aggregation.ts`; update `packages/scripts-ts/src/ci-gate-aggregation.test.ts` and `packages/scripts-ts/src/ci-gate-bootstrap.test.ts` to parse `ci.yml`, exercise every lane output, download/validate exact upstream result artifacts, and reject missing/failed/skipped/unknown shapes.
- **Front report-all:** add `apps/front/scripts/ci/run-non-vitest-report-all.mts` and `apps/front/scripts/ci/run-non-vitest-report-all.test.mts`; change `apps/front/package.json` `test:ci-non-vitest` to invoke the runner while preserving the exact 30-command ordered manifest and nested step report.
- **API reachability:** `packages/scripts-ts/src/check-api-tests-path-coverage.ts` and its test to inspect `ci.yml` and the central classifier/verification job.
- **Shard/artifact contracts:** `apps/front/scripts/ci/vitest-shard-coverage.test.mts`, `packages/scripts-ts/src/artifact-version-compat.test.ts`, `packages/scripts-ts/src/ci-e2e-cleanup.ts`, and the new exact job→lanes→expected-steps `ci-lane-result`/`ci-pr-snapshot` artifact contracts where workflow paths are executable contracts.
- **Closure target:** `.ai/project-closure-v1.json`, `.ai/orchestration-adapter.md`, and `packages/scripts-ts/src/project-closure-adapter.test.ts` use the six old contexts plus `ci-final-gate` in PR A, with `ci_live_pr_checks: ["ci-final-gate"]`, explicit candidate-tip/event-tip source mapping, and live base/merge/workflow provenance; PR B changes required checks to the single central gate only in the candidate-tip config.
- **Drift/local/docs:** `packages/scripts-ts/src/ci-gate-manifest.json`, `packages/scripts-ts/src/reason-guard-ref.json`, `justfile`, the listed local/quality guides, and `AGENTS.md`.

PR B additionally updates `packages/scripts-ts/src/ci-gate-removals.json`, `packages/scripts-ts/src/check-ci-drift.test.ts`, `packages/scripts-ts/src/codeowners-contract.test.ts`, and every repository test that hardcodes a removed workflow path.

## Ruleset migration (separate external operation)

The GitHub ruleset is not stored in this repository. The migration is deliberately ordered around two repository PRs and one atomic external API operation:

1. **PR A — add the central workflow, keep the old producers.** Add `ci.yml`, its tests, `ci_required_checks` equal to the six old contexts plus `ci-final-gate`, `ci_live_pr_checks: ["ci-final-gate"]`, the explicit candidate-tip/event-tip source mapping, and the fixed central workflow identity. Do not delete or rename an old workflow and do not edit the external ruleset. PR A must show the new `ci-final-gate` on its exact head SHA alongside the six old required contexts. The closure CLI resolves the seven-check config from PR A's exact candidate tip, requires all seven configured checks, and additionally requires a matching live-PR snapshot for the central gate; the unchanged GitHub ruleset independently blocks merge until its six old contexts are green. This dual-authority interval is explicit and cannot hide a missing old check from GitHub merge protection.
2. **PR A merge proof.** Squash-merge PR A only after its head-PR central run is green and its old required checks are green. On the resulting `develop` SHA, verify the central workflow's `ci-push-check` is green. The push context is proof that the central workflow is live on the protected branch; it is not PR closure evidence.
3. **Atomic ruleset cutover.** Read ruleset `develop protection`, verify its six old required contexts, then issue one replacement operation that changes the required-context array to exactly `ci-final-gate` while preserving strictness and every non-status rule. Do not apply a mixed or empty intermediate array. Verify the API response contains exactly one required context, `ci-final-gate`, before opening PR B. If the replacement or verification fails, leave the old ruleset authoritative and do not merge PR B.
4. **PR B — remove the old producers.** After the ruleset response is verified, resolve PR B's closure config from its exact candidate tip, require exactly `ci_required_checks: ["ci-final-gate"]` and `ci_live_pr_checks: ["ci-final-gate"]`, then remove the eight replaced workflows. PR B is protected by the central gate already required by the ruleset; old contexts may still appear while GitHub drains old runs, but no old context is authoritative. A canonical `develop` config cannot substitute for this candidate-tip proof. Verify the first post-removal `develop` push has exactly the central 16 check-runs and no duplicate `docs-archive` push result.

The external ruleset operation is not part of either implementation commit and must not be hidden in a workflow. The only temporary state is the deliberate dual-authority interval: PR A's candidate-tip closure config requires old plus new, while the old external ruleset independently requires the old six until the atomic cutover. PR B's candidate-tip closure config changes to the single central context and removes the old producers after both authorities name the same context; the canonical `develop` config is never used to approve that removal before PR B's tip is verified.

## Test and verification contract

The implementation must add or update focused tests before changing the workflow behavior:

- classifier tests for complete relevant/irrelevant lists, count mismatch, malformed response, missing total, merge-group, push, every lane output, and exact output names;
- bootstrap tests that extract the real central classifier step, run it with a missing base classifier, a stub classifier, a failing classifier, and a real fake-`gh` pull-request response;
- aggregation tests for classifier failure, absent/invalid lane outputs, relevant-lane sentinel misuse, irrelevant-lane sentinel success, any `skipped` central result, matrix failure/cancellation, cleanup failure, empty `needs`, exact 15-key artifact aggregation, exact job→lanes→expected-steps set equality, first-step-red/later-steps-recorded fixtures, duplicate/unknown/cross-run records, and the emitted `ok`/`failures` summary;
- structure tests that mutate the real central workflow to remove each front/E2E shard, add matrix `include`/`exclude`, change `fail-fast` to true, move a relevance condition from a step to job level, remove a required sentinel, remove `if: always()` from an independent step or collector, make a required step unconditionally skipped, put `continue-on-error` on a final reducer, disconnect a job from `gate.needs`, use `toJSON(needs)` as a matrix-member source, omit a result artifact, add an unsupported trigger, rename the gate, introduce a second reserved-name producer, or alter any exact job permission;
- topology tests that assert both source and docs-only fixtures expand to the exact 16 display labels and that the two matrix axes remain `[1,2,3,4]` with no conditional job omission;
- Vitest shard-coverage tests against the central workflow's actual matrix and command;
- API path-coverage tests against the central workflow's classifier and API lane;
- deterministic audit fixture tests that never call the npm registry;
- front report-all tests in `apps/front/scripts/ci/run-non-vitest-report-all.test.mts` for the exact 30-command order, first-command failure with all following records present, preserved exit/signal diagnostics, and manifest set equality;
- shared closure-source tests in `/home/radan/ai-orchestration-playbook/tools/tests/test_sources.py` for candidate-tip config fetch/ref binding, `filter=all` pagination, exact-head check-run reads, base/merge/event/workflow provenance parsing, homonymous app/provenance rejection, old/new same-name selection, and live snapshot validation;
- shared closure-CLI tests in `/home/radan/ai-orchestration-playbook/tools/tests/test_cli.py` for candidate-tip-vs-develop config resolution, live PR body/head/base/merge/draft reads, event `GITHUB_SHA`, workflow path/ID/action checks, comment/label non-triggering changes, stale-payload reruns, base advance/ref change, and the invalid→edited→valid, valid→edited→invalid, `ready_for_review`, and head-change sequences;
- shared schema tests in `/home/radan/ai-orchestration-playbook/tools/tests/test_schema_agreement.py` for `ci_live_pr_checks` subset validation, explicit candidate-tip/event-tip source mapping, fixed central workflow identity, and rejection of default-branch-only overrides;
- PublyApp closure-adapter tests asserting the PR A seven-context config, the PR B one-context candidate-tip config, candidate-tip selection over canonical develop, and the shared reader's selected `check_run_id`/`workflow_run_id`/`UNVERIFIED` reasons; no local duplicate-selection implementation;
- drift-manifest tests proving every central workflow step is reconciled and every removed step has a ratchet confession.

Before completion, run focused scripts tests and YAML/manifest checks. The full API and browser suites are acceptance evidence for the implementation PR, not part of this design-only change.

## Rollout and rollback

The rollout is PR A → squash-merge proof → atomic ruleset replacement → PR B. Required-check coverage is never intentionally absent:

1. **PR A:** add `ci.yml`, its tests, the exact permissions map, and `ci_required_checks` equal to the six old contexts plus `ci-final-gate`, with `ci_live_pr_checks: ["ci-final-gate"]`, while retaining all eight old workflows and the old ruleset. Verify a source PR and a docs-only PR each produce exactly 16 central check-runs, including all four front/E2E members and success sentinels rather than skipped jobs. Verify PR A's head has green `ci-final-gate` plus all six old required contexts; the old contexts are enforced by both PR A's seven-context closure list and the external ruleset.
2. **After PR A squash:** verify green `ci-push-check` on the new `develop` SHA. Then replace the six ruleset contexts with exactly `ci-final-gate` in one API operation and verify the response before proceeding.
3. **PR B:** resolve the candidate-tip config as the single `ci-final-gate` required/live context, then remove the eight old workflows. Its central gate is already the sole required ruleset context. Verify the first post-removal `develop` push reads the event-tip config and has the exact 16 central check-runs, no old required context, and no duplicate docs push run.

Rollback is a named, reversible operation:

- if PR A has not merged, close/revert its branch and leave the old workflows, pre-PR-A closure config, and old ruleset untouched;
- after PR A merges but before ruleset cutover, revert PR A and leave the old ruleset untouched;
- after ruleset cutover but before PR B, atomically restore the six old required contexts and verify the response, then revert PR A if central CI must be removed;
- after PR B merges, first land a recovery PR whose candidate-tip config restores the seven-context closure list and whose diff restores the eight old workflow files while keeping the central workflow; verify the restored old contexts, then atomically restore the old ruleset context array. Remove the central workflow only in a later owner-authorized PR after the old system is green.

No rollback path uses a direct push, a forced branch update, or a merge without explicit owner authorization.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A central classifier output is missing or malformed | Literal-output validation, base-pinned source, fail-closed all-lanes fallback, bootstrap tests. |
| A relevant lane is silently skipped | Gate correlates each lane output with the corresponding job result; structure tests mutate each condition. |
| A matrix is narrowed or an axis is excluded | Exact `[1,2,3,4]` pins, no extra matrix keys, real Vitest discovery equality, E2E shard tests. |
| The final gate is disconnected from a new job | `gate.needs` must equal the full central graph; the gate runs the structure guard directly. |
| A stale workflow still claims a reserved context | Whole-repository reserved-name scan and post-migration zero-producer tests. |
| A body edit leaves an older green same-name check in the rollup | The gate reads the live PR body/head/draft, writes a run-scoped body-hash snapshot, and shared closure rejects a green check whose snapshot does not match current live state. |
| A comment or label changes without triggering CI | The fingerprint intentionally excludes comments/labels because current policy does not inspect them; no generic PR timestamp is used as a false freshness barrier. |
| A same-name check is green but comes from another app or lacks provenance | `filter=all` candidate validation fails closed for the required name; fixtures cover green-plus-homonym and green-plus-missing-provenance. |
| A matrix member fails early | `fail-fast: false`, `if: always()` collectors, and exact result artifacts let all shards/teardown finish; the final reducer remains red. |
| A packed front check stops at the first red command | The durable report-all runner executes the exact ordered 30-command manifest, records every outcome, and returns non-zero only after reporting the complete set; runner tests pin first-red/following-command evidence. |
| A stale PR run survives a base or merge-ref change | Live `baseRefName`, `potentialMergeCommit.oid`, the job-provided `$GITHUB_SHA`, and workflow path/ID/action are recorded and compared; `run.head_sha` is bound only to `headRefOid`; base-advance/ref-change/stale-rerun fixtures fail closed. |
| PR B's one-gate config is read from canonical `develop` | Explicit `ci_required_checks_source.pull_request: candidate_tip` forces a Contents API read at live `headRefOid`; adapter/schema tests reject default-branch fallback and hidden overrides. |
| A step disappears from an artifact or runs after a failed predecessor without evidence | Exact job→lanes→expected-steps set equality and `if: always()` mutation tests reject missing/unknown step records; first-red/later-recorded fixtures keep the aggregate red. |
| npm registry outage invalidates unrelated work | Two small isolated audit jobs, one graph per job, no live registry calls in fixture tests. |
| Consolidated verification reruns broad checks after a narrow failure | One shared setup and one verification lane are the deliberate 16-check tradeoff; audits and E2E cleanup remain isolated. Logs identify the failing step so the next implementation can split an expensive lane without changing required-context semantics. |
| E2E cleanup gets package-admin permission | Cleanup remains a distinct job; the final gate never receives `packages: write`. |
| Ruleset and repository config disagree | The external ruleset update is a separate verified operation; closure tests require exactly `ci-final-gate`. |
| The drift ratchet treats deletion as silent coverage loss | Every old step receives a named removal confession and the manifest/reference are regenerated in the same reviewed change. |
| API suite remains a long single job | The 16-check target intentionally keeps one API job; class-hash API sharding from #1947 is explicitly deferred to a separately measured change because it necessarily increases visible checks. |

## Self-review checklist

- [x] Exactly 16 jobs are named, including four front shards and four E2E shards.
- [x] One classifier job and one final gate are defined.
- [x] Old workflow duplication, especially unrestricted docs push runs, is removed.
- [x] Current ruleset contexts and the stale closure-config list are explicitly reconciled.
- [x] Every existing safety invariant has a named owner and proof mechanism.
- [x] The workflow, guard, manifest, local-gate, closure, and documentation files are enumerated.
- [x] PR A closure config is the six old contexts plus the new gate; PR B changes it to the new gate only after atomic ruleset cutover.
- [x] Closure uses `filter=all`, provenance validation, live PR snapshot fingerprints, and explicit comment/label/rerun behavior.
- [x] Closure binds PR config to the candidate tip and rejects base/merge/event/workflow provenance mismatches; `$GITHUB_SHA` is artifact-only event evidence, `run.head_sha` binds to `headRefOid`, and canonical `develop` cannot approve producer removal.
- [x] Front `test:ci-non-vitest` has a durable report-all runner/test with the exact ordered 30-command manifest.
- [x] Matrix failure continuation uses `fail-fast: false`, `if: always()` collectors, exact job→lanes→expected-steps artifact equality, and a real artifact-backed aggregator rather than `toJSON(needs)` member inspection.
- [x] Rollout, external ruleset migration, and rollback are explicit and reversible.
- [x] No unresolved placeholder or contradictory requirement remains.
