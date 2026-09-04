import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { parse } from 'yaml';

// Structural guard for the #1017 aggregate CI gates.
//
// scripts/check-ci-drift.mjs hashes a step's `env`, step-level `if`, `run`,
// `uses`, and `with` — deliberately NOT the workflow trigger, job-level
// `permissions`, `outputs`, `needs`, job-level `if`, matrix, or shell
// defaults. That is correct for its own job (pinning step content), but it
// means the drift guard cannot notice if someone quietly drops a job from
// an aggregate gate's `needs`, changes `gate.if` away from `always()`, or
// breaks a `changes` job's output/permissions — the exact metadata that
// carries this whole feature's safety property. This guard pins that
// metadata directly by parsing the real workflow YAML.
//
// It intentionally does NOT try to verify the gate's shell logic (that is
// scripts/check-ci-drift.mjs's job, via the step-content hash) — only the
// job graph: who depends on whom, under what condition, with what output
// wiring. A job dropped from `gate.needs` while its
// `${{ needs.job.result }}` interpolation stays in the shell body is exactly
// the failure mode this closes: `gate.needs` is required to be the full set
// of every other job in the file, not a hand-maintained list, so removing a
// job from `needs` is a structural mismatch even if nothing else changes.
//
// Round 2 added four more checks, each a distinct false-green wiring a
// reviewer found this guard missed:
//   - the classifier step's `id` (renaming it away from `filter` makes
//     `outputs.relevant`'s literal `steps.filter...` reference resolve
//     empty at runtime, even though the output expression string itself is
//     untouched and still matches EXPECTED_CHANGES_OUTPUT);
//   - the gate job's `name` (the externally required check string — a
//     silent rename produces a missing required context, not a red gate);
//   - the `pull_request` trigger regaining a `paths:` filter (recreates the
//     exact pending-check deadlock #1017 exists to fix);
//   - the gate step's result-aggregation no longer being a hand-maintained
//     Bash map at all: the gate steps now read `${{ toJSON(needs) }}`
//     directly (see the workflow YAML), so there is no second list to drift
//     out of sync with `gate.needs` in the first place. This guard pins
//     that the gate step still wires `NEEDS_JSON` to that exact expression.
//
// Round 3 found the trigger check itself too weak: it only asked whether
// `pull_request.paths` existed, so removing the `pull_request` key entirely,
// swapping to `workflow_dispatch`, or restricting with `paths-ignore`/
// `types`/anything else all passed silently. The trigger check now requires
// `on.pull_request` to exist AND carry no restricting key at all.
//
// Round 4 found two more behavioral fields outside every guard, proven by
// two mutations that changed what CI actually verifies while all tests and
// scripts/check-ci-drift.mjs's step-content hash stayed green:
//   - adding `continue-on-error: true` to a real verification step (or job)
//     makes it report success after it actually fails. This guard now
//     hard-rejects `continue-on-error` on every relevance-gated verification
//     job and on every step inside one — not just forces a hash
//     reconciliation the way check-ci-drift.mjs does for every other step in
//     the repo.
//   - narrowing front-e2e's `shard: [1, 2, 3, 4]` matrix to `[1]` runs a
//     quarter of the suite while nothing else notices. This guard pins the
//     matrix's exact values AND every place that separately hardcodes its
//     denominator (the job name, the `--shard=N/4` flag, the "last shard
//     runs the hermetic counter" check, and the uploaded artifact name) —
//     the matrix and a hardcoded `/4` elsewhere can drift independently.
//
// Round 5 found a nondeterminism bug independently reported by the PR owner:
// a `push` trigger on a gate workflow made the required context reportable by
// TWO separate runs for the same commit (a `pull_request` run and a `push`
// run), and GitHub keeps only the LATEST reported status for a context — so
// a slower, unrelated push-triggered run could overwrite a passing
// pull_request run. Confirmed live: `docs-archive.yml`'s unrestricted `push`
// trigger produced two runs reporting `docs-archive-gate` for the same
// commit. `front-e2e.yml` and `openapi-spec-drift.yml` scope their `push`
// trigger to `branches: [develop]`, which narrows the window but does not
// close the same underlying risk class.
//
// A first fix attempt scoped the gate job's `if:` to `pull_request`/
// `merge_group` only. That was insufficient and was caught live on this same
// PR: GitHub still creates and reports a check run under the SAME name for a
// job that is merely SKIPPED (not absent) — the push-triggered run still
// produced a second `docs-archive-gate` check run, just with conclusion
// `skipped` instead of a real verdict. The exact same "one required context,
// two reports, last one wins" nondeterminism remained; only what the second
// report said had changed. No documented GitHub behavior establishes that a
// `skipped` conclusion on a required context can never later be treated as
// authoritative over an earlier `success` — two independent doc lookups on
// this exact question came back empty, so that could not be proven and was
// not relied on.
//
// Fixed instead by renaming: the required `gate` job's `if:` reverts to
// unconditional `always()` (so a push-triggered run still aggregates real
// upstream results, useful for direct-push/post-merge validation), but its
// `name:` is now conditional on the event — `github.event_name == 'push'`
// reports under a DIFFERENT, non-required context (e.g.
// `docs-archive-push-check`) that can never collide with the required name.
// Applied uniformly to all four workflows (including `front-ci.yml`, which
// has no `push` trigger today, so one added later inherits the same
// protection automatically).
//
// Round 5 also found that `gate-selftest` (the job that runs this very
// script, and every other #1017 guard test, server-side) could be dropped
// from `front-ci-gate`'s `needs` — the decisive "gate.needs must equal every
// other job" check below still caught the drop (gate-selftest exists in the
// file but is no longer in gate.needs), but only when THIS SCRIPT is invoked
// from a job that is itself part of `front-ci-gate`'s needs. Dropping
// gate-selftest disconnects the only job that ran this check server-side, so
// the one required context never re-derived its own needs independently.
// Fixed not in this file but in where it runs: front-ci.yml's `gate` job now
// also runs this exact script as one of ITS OWN steps (see that file), so the
// check cannot be silently disconnected the way a whole job can — only a
// direct edit to the required job's own steps could remove it, which is the
// accepted #1022 malicious-author gap, not the accidental-disconnection gap
// this closes. `requiresSelfCheck: true` below pins that this exact step
// exists.
//
// Round 5 also found two more behavioral fields the round-4 matrix/
// continue-on-error hard-rejects did not cover:
//   - `matrix.exclude` (or `include`, or any other `strategy.matrix` key
//     beyond the pinned axis) can remove or redefine shard combinations
//     while `shard: [1, 2, 3, 4]` itself stays untouched — proven:
//     `exclude: [{shard: 2}, {shard: 3}, {shard: 4}]` left only shard 1/4
//     running while every other guard stayed green. `strategy.matrix` is now
//     required to declare EXACTLY the one pinned key, nothing else.
//   - a job/workflow-level `defaults: run: shell: bash {0}` silently drops
//     bash's implicit `-e` (GitHub's documented unspecified-shell default is
//     `bash -e {0}`), letting a failed verification command inside a
//     multi-line `run:` block be followed — and its failure erased — by a
//     later command's exit code. Proven against front-e2e.yml's real
//     Playwright step. This guard now hard-rejects any `defaults:` on a
//     relevance-gated job, an always-run job, or the workflow itself, AND
//     the Playwright step's own `run:` now starts with `set -euo pipefail`
//     so fail-fast is a property of the script itself, independent of
//     whatever shell default is (or later becomes) in effect around it.
//   - `continue-on-error: true` on the required gate job's own "Check
//     required jobs" step masks a correctly-detected aggregation failure the
//     exact same way it masks a verification step's failure — the round-4
//     hard-reject was scoped only to `relevanceGatedJobs`, not the gate job
//     itself. This guard now also hard-rejects `continue-on-error` anywhere
//     in the gate job, AND requires a subsequent step that reads that step's
//     `outcome` (not `conclusion` — GitHub computes `outcome` BEFORE
//     `continue-on-error` is applied, so it cannot be rewritten by it) and
//     fails when that outcome was not `success`. That is the actual
//     enforcement; the hard-reject above is a second, independent layer.
//
// Round 6 found the round-5 rename fix load-bearing but under-enforced: the
// gate job's `name:` was pinned as
// `github.event_name == 'push' && '<push-check>' || '<required>'`, an
// EXCLUSION list. Every event other than `push` — including one added to the
// workflow's `on:` later — resolved to the required name. Adding
// `workflow_dispatch:` to a gate workflow's triggers therefore recreated a
// second reporter of the required context (GitHub documents that a manual
// run takes a branch/tag `ref` and uses its last commit as GITHUB_SHA, so a
// maintainer can dispatch it against a pull-request branch), and both
// enforced guards stayed green. Two independent layers close that now:
//   - the name expression is an ALLOWLIST: only `pull_request` and
//     `merge_group` — the two events a required check must report for —
//     resolve to the required name; every other event resolves to the
//     non-required push-check name. Adding an event can no longer produce a
//     second report of the required context, whatever the event is.
//   - a gate workflow's `on:` may declare only `pull_request`,
//     `merge_group`, and `push`. Anything else is rejected outright, which
//     also keeps the `<workflow>-push-check` name honest: the only non-PR
//     event that can reach it is `push`.
// Round 6 also found that nothing stopped a job in ANY OTHER workflow from
// reporting one of the four required names — see
// findRequiredContextCollisionProblems below.

const workflowsDirectory = '.github/workflows';

const EXPECTED_CHANGES_OUTPUT = '${{ steps.filter.outputs.relevant }}';
const EXPECTED_CLASSIFIER_STEP_ID = 'filter';
const EXPECTED_RELEVANCE_IF = "needs.changes.outputs.relevant == 'true'";
// Every always-run job in these workflows — including the required `gate`
// job itself — always reports (if: always()). What makes `gate` safe from
// the push-triggered nondeterminism described above is its `name:`, not its
// `if:` (see EXPECTED_GATE_NAME_EXPR below).
const EXPECTED_GATE_IF = 'always()';
const EXPECTED_NEEDS_JSON_EXPR = '${{ toJSON(needs) }}';
// Round 5 BLOCKER: the "Check required jobs" step's `id`, so a sibling step
// can read `steps.<id>.outcome` — the raw result GitHub computes BEFORE
// `continue-on-error` is applied, as opposed to `.conclusion` (after). A
// single `continue-on-error: true` added to the id'd step cannot rewrite
// `.outcome`, so a step checking it is not fooled the way the job's overall
// result would be.
const EXPECTED_CHECK_REQUIRED_JOBS_STEP_ID = 'check-required-jobs';

/**
 * Converts a glob pattern to a RegExp over POSIX paths. Deliberately NOT a
 * general glob engine: it supports exactly the constructs the pinned
 * runners' configs use (`**`, `*`, `{a,b}` alternation, literals) and treats
 * everything else as a literal, so an exotic future pattern can only fail
 * the include check loudly (fail closed), never silently widen.
 */
const globToRegExp = (pattern: string): RegExp => {
	const escapeRegex = (value: string): string =>
		value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	let expression = '';

	for (let i = 0; i < pattern.length; i += 1) {
		const char = pattern[i];

		if (char === '*' && pattern[i + 1] === '*') {
			expression += '[\\s\\S]*';
			i += 1;
		} else if (char === '*') {
			expression += '[^/]*';
		} else if (char === '{') {
			const closing = pattern.indexOf('}', i);

			if (closing === -1) {
				expression += '\\{';
			} else {
				expression += `(?:${pattern
					.slice(i + 1, closing)
					.split(',')
					.map((alternative: string) => escapeRegex(alternative))
					.join('|')})`;
				i = closing;
			}
		} else if ('\\^$.|+()[]{}'.includes(char)) {
			expression += `\\${char}`;
		} else {
			expression += char;
		}
	}

	return new RegExp(`^${expression}$`);
};

/**
 * Extracts a top-level `key: [...]` string array (the shape vitest configs
 * use for `include`/`exclude`) from a config's source text. Returns null
 * when the key or its array is absent, so callers can fail closed.
 */
const extractStringArrayField = (
	source: string,
	key: string,
): string[] | null => {
	const field = source.match(
		new RegExp(`\\b${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`),
	);

	if (field === null) {
		return null;
	}

	return [...field[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
};

/**
 * Round 6 BLOCKER: the ONLY events whose runs may report a gate's externally
 * required check name. Everything else resolves to the non-required
 * push-check name, so no event added to a gate workflow later can produce a
 * second report of a required context for the same commit.
 */
const REQUIRED_CONTEXT_EVENTS = ['pull_request', 'merge_group'];

/**
 * Round 6 BLOCKER, second layer: the complete set of events a gate workflow
 * may subscribe to. `pull_request` and `merge_group` are separately required
 * to be present and unconditional; `push` is optional (three of the four
 * declare it, for direct-push/post-merge validation). Any other event is
 * rejected outright.
 */
const ALLOWED_GATE_TRIGGER_EVENTS = new Set([
	...REQUIRED_CONTEXT_EVENTS,
	'push',
]);

/**
 * The exact `name:` expression a gate job must carry: the required check
 * string for a `pull_request`/`merge_group` run, the non-required push-check
 * string for anything else.
 */
// @ts-expect-error rung-0: add proper type in later rung
const gateNameExpression = ({ gateName, pushCheckName }) =>
	`\${{ (${REQUIRED_CONTEXT_EVENTS.map(
		(event) => `github.event_name == '${event}'`,
	).join(' || ')}) && '${gateName}' || '${pushCheckName}' }}`;

/** The exact `name:` expression front-e2e.yml's sharded `test` job must carry. */
// @ts-expect-error rung-0: add proper type in later rung
const matrixJobNameExpression = ({ key, expected, file }) =>
	file === 'front-ci.yml'
		? `front-ci (\${{ matrix.${key} }}/${expected.length})`
		: `front-e2e (\${{ matrix.${key} }}/${expected.length})`;

/**
 * The four #1017 aggregate-gate workflows and the job graph each one must
 * have. `relevanceGatedJobs` are jobs that only run when `changes` says the
 * workflow's paths are relevant; `alwaysJobs` are jobs (like front-e2e's
 * GHCR `cleanup`) that intentionally run regardless via their own
 * `if: always()`. `gate.needs` is not listed here — it is required to equal
 * every other job in the file, computed from the parsed document itself.
 * `gateName` is the externally required check string. `pushCheckName` is the
 * DIFFERENT name the same job must report under for a `push`-triggered run,
 * so that run can never collide with `gateName` as a duplicate report for
 * the same commit — see the file-level comment.
 */
// Exported so the structure test can pin the table's own pinnedTestFiles
// contents against EXPECTED_PINNED_TEST_FILES (PR #1312 round 2).
export const GATE_WORKFLOWS = [
	{
		file: 'front-e2e.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'front-e2e-gate',
		pushCheckName: 'front-e2e-push-check',
		relevanceGatedJobs: [
			{ id: 'build', needs: ['changes'] },
			{ id: 'test', needs: ['changes', 'build'] },
		],
		alwaysJobs: [{ id: 'cleanup', needs: ['build', 'test'] }],
		// Round 4: pins the sharded e2e matrix itself AND every place that
		// separately hardcodes its denominator, so a matrix narrowed to
		// `[1]` (running a quarter of the suite) cannot pass silently, and
		// so the job name / shard flag / last-shard check / artifact name
		// cannot drift out of sync with the matrix length independently.
		matrix: { jobId: 'test', key: 'shard', expected: [1, 2, 3, 4] },
	},
	{
		file: 'front-ci.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'front-ci-gate',
		pushCheckName: 'front-ci-push-check',
		relevanceGatedJobs: [
			{ id: 'supply-chain', needs: ['changes'] },
			{ id: 'audit-production', needs: ['changes'] },
			{ id: 'gate-selftest', needs: ['changes'] },
			// #1948: the shard matrix and its coverage proof are both
			// gated on the changes classifier like their siblings. Being in
			// this list gives them the same hard protections as the other
			// verification jobs: required `if:`, required `needs`,
			// no job- or step-level `continue-on-error`, and no
			// `defaults:` shell override (which could drop `-e` and mask a
			// shard failure).
			{ id: 'test-vitest', needs: ['changes'] },
			{ id: 'test-vitest-coverage', needs: ['changes'] },
		],
		alwaysJobs: [],
		// #1948: pins the 4-way vitest shard matrix for front-ci.yml, same
		// pattern as front-e2e.yml's matrix pin above. The matrix must
		// declare exactly [1, 2, 3, 4] — narrowing it silently runs a
		// fraction of the suite while every other guard stays green.
		matrix: { jobId: 'test-vitest', key: 'shard', expected: [1, 2, 3, 4] },
		// IMPORTANT fix: the four #1017 gate test suites and this very CLI
		// were reachable only through local `just ci-drift` — no workflow ran
		// them. `gate-selftest` above runs them server-side, but that is only
		// real enforcement if it actually wakes up for a change to any of the
		// four workflow files it asserts against (not just front-ci.yml) and
		// to the guard scripts themselves. This asserts the classifier
		// pattern extracted from the REAL `changes` job actually matches
		// every one of these paths, so the pattern narrowing back to
		// front-ci.yml-only (or dropping guard-script coverage) is caught
		// here rather than silently reintroducing the "unenforced on the
		// server" gap this fix closes.
		//
		// Round 6 BLOCKER: widened from the four gate files to EVERY workflow
		// file. findRequiredContextCollisionProblems below scans every job in
		// every workflow in the repository, because any one of them can claim
		// a required check name — the reviewer's reproduction made
		// a now-deleted workflow report `docs-archive-gate`, which
		// the four-file classifier pattern classified as irrelevant, so the
		// only job that runs the scan server-side never woke up. The last
		// entry deliberately names a workflow file that does not exist: the
		// pattern must classify an ARBITRARY workflow file as relevant, so it
		// cannot narrow back to an enumerated list of today's files while
		// still satisfying every other entry here.
		selfTestCoverage: [
			'.github/workflows/front-ci.yml',
			'.github/workflows/front-e2e.yml',
			'.github/workflows/openapi-spec-drift.yml',
			'.github/workflows/docs-archive.yml',
			'.github/workflows/deploy-images.yml',
			'.github/workflows/require-linked-issue.yml',
			'.github/workflows/a-workflow-file-that-does-not-exist-yet.yml',
			'packages/scripts-ts/src/ci-changed-paths.ts',
			'packages/scripts-ts/src/check-ci-drift.ts',
			'packages/scripts-ts/src/check-ci-gate-structure.ts',
		],
		// Round 5 BLOCKER fix: front-ci-gate must independently re-derive its
		// own job graph's correctness rather than relying solely on
		// gate-selftest (see the file-level comment).
		requiresSelfCheck: true,
		// PR #1312 round 1 (review MAJOR/BLOCKS_PR): the real-`<Trans>` render
		// guard is the ONLY front-suite file that mounts react-i18next's
		// `<Trans>` unmocked over the real route components (85 of 213 front
		// test files mock react-i18next — that is the suite-wide blindness it
		// offsets). Its entire value therefore depends on this exact file
		// staying at this exact path AND still being discovered by the vitest
		// config: renamed, moved, deleted, or quietly excluded from the glob,
		// `pnpm --filter front test` stays green while the unmocked coverage
		// is gone and no other guard notices. Pinning the path here makes all
		// four moves fail this guard (and therefore `just ci-drift`,
		// gate-selftest, and the required front-ci-gate) until the pin is
		// consciously re-made. This is a strengthening pin, not an allowlist:
		// nothing is exempted from anything.
		//
		// PR #1312 round 2 (review MAJOR/BLOCKS_PR): THIS ARRAY is itself the
		// attack surface — the reviewer deleted the entry and every check
		// stayed green, because an ABSENT pin is a compliant default (no pin
		// => no enforcement => no findings). The exact contents are therefore
		// pinned by EXPECTED_PINNED_TEST_FILES + findPinnedTestFilesProblems
		// below, asserted inside findCiGateStructureProblems itself, so the
		// real-tree self-test, this script's CLI, gate-selftest, and
		// `just ci-drift` all enforce it: deleting the entry, renaming its
		// path, swapping its runnerConfig, or quietly adding an undeclared
		// pin goes RED naming the difference.
		pinnedTestFiles: [
			{
				path: 'apps/front/src/lib/i18n/trans-render.guard.test.tsx',
				runnerConfig: 'apps/front/vitest.config.ts',
				reason:
					'the real-<Trans> render guard: the only suite file exercising react-i18next unmocked over the production route files, so losing it silently would reintroduce the exact #1269/#1285 blindness this guard offsets',
			},
		],
		// #1709 round 6: the ratchet floor guard's own test file
		// (gen-reason-ref.test.ts) shipped with 463 lines of tests that NO
		// workflow step ran — the literal "guard that nothing runs" failure
		// mode. The step's `run:` block is file-by-file enumeration
		// (intentional: running every `*.test.ts` under
		// packages/scripts-ts/src/ would pull in audit-docs-prune.test.ts,
		// which is currently red on a pre-existing fixture bug and is out of
		// scope for this fix). To keep that enumeration from quietly losing
		// the next test file the same way, this array lists the files the
		// `Run CI gate guard tests (mirrors \`just ci-drift\`)` step's
		// `run:` block is EXPECTED to invoke, and findGateSelftestTestsProblems
		// below parses the REAL `run:` text to assert it covers exactly
		// these files. Mirrored by EXPECTED_GATE_SELFTEST_TESTS so the
		// expectation cannot quietly outlive the workflow step (symmetric
		// pin, the same shape as pinnedTestFiles above).
		//
		// What this catches: any edit to the workflow's `run:` block that
		// drops or renames a vitest invocation, any edit to the
		// GATE_WORKFLOWS entry's `gateSelftestTests` array, and any edit
		// to EXPECTED_GATE_SELFTEST_TESTS that is not re-made on BOTH sides
		// at once. What it does NOT catch: a contributor adding a brand-new
		// `*.test.ts` file under packages/scripts-ts/src/ and forgetting to
		// add a matching line in three places (the workflow step, the
		// gateSelftestTests array, AND the EXPECTED_GATE_SELFTEST_TESTS
		// array). That three-place wiring is the load-bearing cost of
		// running the suite selectively rather than the whole thing; the
		// review's job is to keep them in lock-step, and the structural
		// check below makes any one-side edit fail the gate immediately so
		// the drift cannot be silent.
		gateSelftestTests: [
			'packages/scripts-ts/src/artifact-version-compat.test.ts',
			'packages/scripts-ts/src/check-actions-pinned.test.ts',
			'packages/scripts-ts/src/check-actions-pins.test.ts',
			'packages/scripts-ts/src/check-api-tests-path-coverage.test.ts',
			'packages/scripts-ts/src/check-ci-drift.test.ts',
			'packages/scripts-ts/src/check-ci-gate-structure.test.ts',
			'packages/scripts-ts/src/check-cyclomatic-bound.test.ts',
			'packages/scripts-ts/src/check-no-floating-promises.test.ts',
			'packages/scripts-ts/src/ci-changed-paths.test.ts',
			'packages/scripts-ts/src/ci-e2e-rerun-guard.test.ts',
			'packages/scripts-ts/src/ci-gate-aggregation.test.ts',
			'packages/scripts-ts/src/ci-gate-bootstrap.test.ts',
			'packages/scripts-ts/src/ci-referenced-paths.test.ts',
			'packages/scripts-ts/src/codeowners-contract.test.ts',
			// #1709: ratchet floor generator's own suite. This is the
			// line that closes the round-6 finding: 463 lines of tests
			// that were never run on the server.
			'packages/scripts-ts/src/gen-reason-ref.test.ts',
			'packages/scripts-ts/src/lint-front.test.ts',
			'packages/scripts-ts/src/npm-audit-runner.test.ts',
			'packages/scripts-ts/src/prod-audit-bites.test.ts',
			'packages/scripts-ts/src/require-linked-issue.test.ts',
		],
	},
	{
		file: 'openapi-spec-drift.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'openapi-spec-drift-gate',
		pushCheckName: 'openapi-spec-drift-push-check',
		relevanceGatedJobs: [{ id: 'spec-drift', needs: ['changes'] }],
		alwaysJobs: [],
	},
	{
		file: 'docs-archive.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'docs-archive-gate',
		pushCheckName: 'docs-archive-push-check',
		relevanceGatedJobs: [{ id: 'docs-archive', needs: ['changes'] }],
		alwaysJobs: [],
	},
	{
		file: 'quality-gate.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'quality-gate',
		pushCheckName: 'quality-gate-push-check',
		relevanceGatedJobs: [
			{ id: 'quality', needs: ['changes'] },
			{ id: 'audit-development', needs: ['changes'] },
		],
		alwaysJobs: [],
	},
	{
		// #1462: CI finally runs the full API test suite (`just test-api`,
		// ~2,000 specs on real Postgres via Testcontainers) as a required PR
		// check. The heavy job is deliberately named `suite`, NOT `api-tests`:
		// the reserved-name rule below rejects any job whose reported name
		// CONTAINS a reserved name, so the required context `api-tests-gate`
		// may be reported by this workflow's gate job only.
		file: 'api-tests.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'api-tests-gate',
		pushCheckName: 'api-tests-push-check',
		relevanceGatedJobs: [{ id: 'suite', needs: ['changes'] }],
		alwaysJobs: [],
	},
	{
		file: 'react-doctor.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'react-doctor-gate',
		pushCheckName: 'react-doctor-push-check',
		relevanceGatedJobs: [{ id: 'react-doctor', needs: ['changes'] }],
		alwaysJobs: [],
	},
];

// PR #1312 round 2 (review MAJOR/BLOCKS_PR): the pin-of-the-pin. GATE_WORKFLOWS
// above is code, so deleting the front-ci entry's `pinnedTestFiles` array (or a
// member of it) is itself an unguarded "compliant default": the round-1
// enforcement loop only runs over entries that EXIST, and no test asserted that
// any does — the reviewer's mutation left every check green while the
// trans-render guard lost its CI enforcement silently. This declared
// expectation pins the exact multiset of `pinnedTestFiles` across the real
// table; findPinnedTestFilesProblems below asserts
// expectation == workflow-derived == on-disk existence, symmetrically: removing
// an entry goes RED naming it, adding an undeclared one goes RED naming it.
//
// This list MUST stay in lock-step with the `pinnedTestFiles` arrays in
// GATE_WORKFLOWS — which is exactly the point: any change to either side is a
// conscious, reviewed edit to both.
// Exported for the structure test's symmetric RED assertions (see above).
export const EXPECTED_PINNED_TEST_FILES = [
	{
		file: 'front-ci.yml',
		path: 'apps/front/src/lib/i18n/trans-render.guard.test.tsx',
		runnerConfig: 'apps/front/vitest.config.ts',
		reason:
			'the real-<Trans> render guard: the only suite file exercising react-i18next unmocked over the production route files, so losing it silently would reintroduce the exact #1269/#1285 blindness this guard offsets',
	},
];

// #1709 round 6: the pin-of-the-pin for the `gate-selftest` step's vitest
// invocations. The `gateSelftestTests` array on front-ci.yml's GATE_WORKFLOWS
// entry is the source of truth for the structural check below; this list is
// the declared expectation that must stay in lock-step with it, exactly like
// EXPECTED_PINNED_TEST_FILES above. Removing an entry here is RED naming it;
// adding an undeclared entry to GATE_WORKFLOWS is RED naming it. This
// eliminates the round-6 failure mode: 463 lines of ratchet-floor tests
// shipped in a file the workflow never ran, because no structural check
// linked the workflow's `run:` block to the existence of the test file.
//
// This list MUST stay in lock-step with the `gateSelftestTests` arrays in
// GATE_WORKFLOWS — which is exactly the point: any change to either side
// must be a conscious, reviewed edit to both.
// Exported for the structure test's symmetric RED assertions (see above).
export const EXPECTED_GATE_SELFTEST_TESTS = [
	'packages/scripts-ts/src/artifact-version-compat.test.ts',
	'packages/scripts-ts/src/check-actions-pinned.test.ts',
	'packages/scripts-ts/src/check-actions-pins.test.ts',
	'packages/scripts-ts/src/check-api-tests-path-coverage.test.ts',
	'packages/scripts-ts/src/check-ci-drift.test.ts',
	'packages/scripts-ts/src/check-ci-gate-structure.test.ts',
	'packages/scripts-ts/src/check-cyclomatic-bound.test.ts',
	'packages/scripts-ts/src/check-no-floating-promises.test.ts',
	'packages/scripts-ts/src/ci-changed-paths.test.ts',
	'packages/scripts-ts/src/ci-e2e-rerun-guard.test.ts',
	'packages/scripts-ts/src/ci-gate-aggregation.test.ts',
	'packages/scripts-ts/src/ci-gate-bootstrap.test.ts',
	'packages/scripts-ts/src/ci-referenced-paths.test.ts',
	'packages/scripts-ts/src/codeowners-contract.test.ts',
	// #1709: ratchet floor generator's own suite. The round-6 finding
	// was that 463 lines of ratchet tests shipped with no CI consumer
	// because the file-by-file enumeration in the `gate-selftest`
	// step's `run:` block quietly missed it. This entry is the
	// structural pin that ensures the line cannot be dropped again
	// without also updating the expectation here.
	'packages/scripts-ts/src/gen-reason-ref.test.ts',
	'packages/scripts-ts/src/lint-front.test.ts',
	'packages/scripts-ts/src/npm-audit-runner.test.ts',
	'packages/scripts-ts/src/prod-audit-bites.test.ts',
	'packages/scripts-ts/src/require-linked-issue.test.ts',
];

// @ts-expect-error rung-0: add proper type in later rung
const toPosixPath = (value) => value.split(path.sep).join('/');

/** Normalizes a job's `needs` (string | string[] | undefined) to an array. */
// @ts-expect-error rung-0: add proper type in later rung
const normalizeNeeds = (needs) => {
	if (needs === undefined) {
		return [];
	}

	if (Array.isArray(needs)) {
		return needs;
	}
	return [needs];
};

// @ts-expect-error rung-0: add proper type in later rung
const asSet = (values) => new Set(values);

const PINNED_TEST_FILES_EXPECTATION_HEADER =
	'PR #1312 round 2: the declared pinnedTestFiles expectation';

/**
 * PR #1312 round 2 (review MAJOR/BLOCKS_PR): pins the EXACT multiset of
 * `pinnedTestFiles` entries across the real GATE_WORKFLOWS against
 * EXPECTED_PINNED_TEST_FILES, symmetrically — removing a declared entry is
 * RED naming it; adding an undeclared one is RED naming it; changing an
 * entry's runnerConfig or reason without re-making the expectation is RED
 * naming it — AND requires every pinned file to exist on disk, so the
 * expectation can never quietly outlive its target.
 *
 * This closes the round-1 gap where deleting the front-ci entry's
 * `pinnedTestFiles` array itself left every check green: the enforcement loop
 * above only iterates over pins that exist, so an ABSENT pin was a compliant
 * default and the trans-render guard's CI enforcement could be switched off
 * silently. Deliberately asserted inside findCiGateStructureProblems (not only
 * in a test): the real-tree self-test, this script's CLI, gate-selftest, and
 * `just ci-drift` then all carry it with no new wiring to drop.
 */
export const findPinnedTestFilesProblems = async ({
	rootDir,
	// Test seam ONLY: lets the structure test derive from a mutated copy of
	// the table to prove the comparison flips RED symmetrically. Every
	// production caller omits it, so the check always runs against the real
	// GATE_WORKFLOWS.
	workflows = GATE_WORKFLOWS,
}) => {
	const findings = [];

	/** file → path → {runnerConfig, reason}; derived from the given table. */
	const derived = [];
	for (const workflow of workflows) {
		for (const pin of workflow.pinnedTestFiles ?? []) {
			derived.push({
				file: workflow.file,
				path: pin.path,
				runnerConfig: pin.runnerConfig,
				reason: pin.reason,
			});
		}
	}

	// Multiset comparison over stable string keys, so duplicate entries are
	// caught too (one removed while a twin remains would otherwise pass).
	const entryKey = (pin) =>
		JSON.stringify([pin.file, pin.path, pin.runnerConfig, pin.reason]);
	const derivedByKey = new Map();
	for (const pin of derived) {
		derivedByKey.set(entryKey(pin), [
			...(derivedByKey.get(entryKey(pin)) ?? []),
			pin,
		]);
	}
	const expectedByKey = new Map();
	for (const pin of EXPECTED_PINNED_TEST_FILES) {
		expectedByKey.set(entryKey(pin), [
			...(expectedByKey.get(entryKey(pin)) ?? []),
			pin,
		]);
	}

	for (const [key, expected] of expectedByKey) {
		if (derivedByKey.has(key)) {
			continue;
		}
		findings.push(
			`${PINNED_TEST_FILES_EXPECTATION_HEADER}: GATE_WORKFLOWS no longer carries ${expected.length > 1 ? 'any of' : 'the'} ${expected.length > 1 ? 'entries' : 'entry'} for \`${expected[0].file}\` -> \`${expected[0].path}\`. Removing or editing a pinned-test-file entry switches that coverage's CI enforcement off silently — restore the entry in check-ci-gate-structure.ts exactly as declared by EXPECTED_PINNED_TEST_FILES, or consciously re-make BOTH lists together.`,
		);
	}

	for (const [key, actual] of derivedByKey) {
		if (expectedByKey.has(key)) {
			continue;
		}
		findings.push(
			`${PINNED_TEST_FILES_EXPECTATION_HEADER}: GATE_WORKFLOWS carries an undeclared pinnedTestFiles entry for \`${actual[0].file}\` -> \`${actual[0].path}\`. Every pin must be declared in EXPECTED_PINNED_TEST_FILES (check-ci-gate-structure.ts) — add it there consciously, or remove the undeclared entry.`,
		);
	}

	// A matching declaration whose file has vanished fails closed here too:
	// the expectation must never describe coverage that no longer exists.
	for (const pin of EXPECTED_PINNED_TEST_FILES) {
		try {
			await access(path.join(rootDir, pin.path));
		} catch {
			findings.push(
				`${PINNED_TEST_FILES_EXPECTATION_HEADER}: the declared pin \`${pin.file}\` -> \`${pin.path}\` points at a file that does not exist on disk. Re-point both lists at the file's reviewed new path.`,
			);
		}
	}

	return findings;
};

const GATE_SELFTEST_TESTS_EXPECTATION_HEADER =
	'#1709 round 6: the declared gateSelftestTests expectation';

// Matches the vitest invocation line shape the `gate-selftest` step's `run:`
// block uses. Deliberately tight: `pnpm --filter scripts-ts exec vitest run
// <path>`, anchored on the leading `pnpm --filter scripts-ts` so unrelated
// shell text (e.g. a future step that runs the same test via a different
// command) is not double-counted. Captures the test file path as group 1.
const GATE_SELFTEST_VITEST_LINE =
	/^\s*pnpm --filter scripts-ts exec vitest run (\S+\.test\.tsx?)\s*$/;

/**
 * Extracts every `pnpm --filter scripts-ts exec vitest run src/X.test.ts`
 * invocation from a multiline `run:` block, as a Set of POSIX-normalized
 * paths. Lines that don't match the exact shape are ignored — the structural
 * check below is intentionally narrow so a future comment line, an
 * environment variable expansion, or a piped command does not get parsed as
 * a test invocation.
 */
// @ts-expect-error rung-0: add proper type in later rung
const extractGateSelftestTestPaths = (runBlock) => {
	if (typeof runBlock !== 'string') {
		return new Set();
	}
	const paths = new Set();
	for (const line of runBlock.split('\n')) {
		const match = line.match(GATE_SELFTEST_VITEST_LINE);
		if (match === null) {
			continue;
		}
		// The workflow uses `src/X.test.ts` (relative to the package
		// root); the structural expectation and on-disk check use the
		// full `packages/scripts-ts/src/X.test.ts` form. Normalize so
		// the comparison is path-form agnostic — a future switch to
		// either form is a no-op for the structural check.
		const captured = match[1];
		const normalized = captured.startsWith('packages/')
			? toPosixPath(captured)
			: toPosixPath(`packages/scripts-ts/${captured}`);
		paths.add(normalized);
	}
	return paths;
};

/**
 * PR #1709 round 6 (review MAJOR/BLOCKS_PR): the ratchet floor guard's own
 * test file (`packages/scripts-ts/src/gen-reason-ref.test.ts`) shipped with
 * 463 lines of tests that no workflow step ran — the "guard that nothing
 * runs" failure mode. The gate-selftest step's `run:` block is a deliberate
 * file-by-file enumeration (a bare `pnpm --filter scripts-ts exec vitest run`
 * would pull in `audit-docs-prune.test.ts`, currently red on a pre-existing
 * fixture bug out of scope here, and other suites the gate does not own).
 * Without a structural pin, the next omitted file is silent.
 *
 * This function pins the test-file list three ways, symmetrically, exactly
 * the shape used by `findPinnedTestFilesProblems` above for pinnedTestFiles:
 *   1. The REAL `gate-selftest` step's `run:` block in front-ci.yml is parsed
 *      for `pnpm --filter scripts-ts exec vitest run src/X.test.ts` lines.
 *      That derived set is compared against the `gateSelftestTests` array
 *      declared on the front-ci GATE_WORKFLOWS entry — any drift between the
 *      workflow and the structural expectation goes RED.
 *   2. The `gateSelftestTests` array is compared against
 *      EXPECTED_GATE_SELFTEST_TESTS, the declared pin-of-the-pin — removing
 *      an entry from either side is RED naming it; adding an undeclared
 *      entry is RED naming it.
 *   3. Every entry in EXPECTED_GATE_SELFTEST_TESTS is required to exist on
 *      disk, so the expectation cannot quietly outlive the file.
 *
 * Deliberately asserted inside findCiGateStructureProblems (not only in a
 * test): the real-tree self-test, this script's CLI, gate-selftest, and
 * `just ci-drift` then all carry it with no new wiring to drop — exactly
 * the false-negative shape this closes.
 */
export const findGateSelftestTestsProblems = async ({
	// @ts-expect-error rung-0: add proper type in later rung
	rootDir,
	// Test seam ONLY: lets the structure test derive from a mutated copy of
	// the table to prove the comparison flips RED symmetrically. Every
	// production caller omits it, so the check always runs against the real
	// GATE_WORKFLOWS.
	workflows = GATE_WORKFLOWS,
}) => {
	const findings = [];

	// The step name the gate-selftest job's vitest step carries today. The
	// structural check anchors on this name so a renamed step is RED rather
	// than silently un-pinned.
	const EXPECTED_GATE_SELFTEST_STEP_NAME =
		'Run CI gate guard tests (mirrors `just ci-drift`)';

	/** file → Set<path>; derived from the given table's `gateSelftestTests`. */
	const derivedByFile = new Map();
	for (const workflow of workflows) {
		if (workflow.gateSelftestTests === undefined) {
			continue;
		}
		derivedByFile.set(workflow.file, new Set());
		for (const testPath of workflow.gateSelftestTests) {
			derivedByFile.get(workflow.file).add(toPosixPath(testPath));
		}
	}

	// (1) For every workflow that declares gateSelftestTests, read its real
	// `gate-selftest` job's expected step's `run:` block and compare the
	// parsed test paths to the declared set.
	for (const workflow of workflows) {
		if (workflow.gateSelftestTests === undefined) {
			continue;
		}

		const declared = derivedByFile.get(workflow.file);
		const filePath = path.join(rootDir, workflowsDirectory, workflow.file);

		let document;
		try {
			const raw = await readFile(filePath, 'utf8');
			document = parse(raw);
		} catch {
			findings.push(
				`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: cannot read ${workflow.file} to verify the \`gate-selftest\` step's \`run:\` block against \`gateSelftestTests\` — file is missing or unreadable.`,
			);
			continue;
		}

		const jobs = document?.jobs ?? {};
		const selftestJob = jobs['gate-selftest'];
		if (selftestJob === undefined) {
			findings.push(
				`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: ${workflow.file} declares a \`gateSelftestTests\` list but the workflow has no \`gate-selftest\` job to anchor it against. Either add the job or remove the list.`,
			);
			continue;
		}

		const steps = Array.isArray(selftestJob.steps) ? selftestJob.steps : [];
		const selftestStep = steps.find(
			// @ts-expect-error rung-0: TS2345
			(step) => step?.name === EXPECTED_GATE_SELFTEST_STEP_NAME,
		);

		if (selftestStep === undefined) {
			findings.push(
				`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: ${workflow.file}::gate-selftest is expected to carry a step named "${EXPECTED_GATE_SELFTEST_STEP_NAME}" so its \`run:\` block can be pinned against \`gateSelftestTests\`, but the step is missing. Rename the step or update the check's expected name.`,
			);
			continue;
		}

		const runBlock =
			typeof selftestStep.run === 'string' ? selftestStep.run : '';
		const parsed = extractGateSelftestTestPaths(runBlock);

		// Files in the declared set but missing from the real `run:` block.
		for (const testPath of declared) {
			if (!parsed.has(testPath)) {
				findings.push(
					`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: ${workflow.file}::gate-selftest's "${EXPECTED_GATE_SELFTEST_STEP_NAME}" step's \`run:\` block does NOT invoke \`pnpm --filter scripts-ts exec vitest run ${testPath}\` (declared in GATE_WORKFLOWS.front-ci.gateSelftestTests). Adding a structural pin without the matching shell line silences the guard exactly like the round-6 finding: a contributor edits the expectation, the guard's own tests stop running. Re-add the line to the step's \`run:\` block (mirror the addition in \`just ci-drift\` too), or remove the entry from the structural list.`,
				);
			}
		}

		// Files in the real `run:` block but missing from the declared set.
		for (const testPath of parsed) {
			if (!declared.has(testPath)) {
				findings.push(
					`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: ${workflow.file}::gate-selftest's "${EXPECTED_GATE_SELFTEST_STEP_NAME}" step's \`run:\` block invokes \`pnpm --filter scripts-ts exec vitest run ${testPath}\` but the file is NOT declared in GATE_WORKFLOWS.front-ci.gateSelftestTests. Adding a vitest line without the matching structural pin re-introduces the round-6 silent-drop mode the next time someone touches the structural list — declare it there (and in EXPECTED_GATE_SELFTEST_TESTS) at the same time.`,
				);
			}
		}
	}

	// (2) Symmetric pin: GATE_WORKFLOWS.gateSelftestTests ↔ EXPECTED_GATE_SELFTEST_TESTS.
	const expectedSet = new Set(
		EXPECTED_GATE_SELFTEST_TESTS.map((value) => toPosixPath(value)),
	);
	const flatDerived = new Set();
	for (const value of derivedByFile.values()) {
		for (const testPath of value) {
			flatDerived.add(testPath);
		}
	}

	for (const testPath of expectedSet) {
		if (flatDerived.has(testPath)) {
			continue;
		}
		findings.push(
			`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: EXPECTED_GATE_SELFTEST_TESTS declares \`${testPath}\` but no GATE_WORKFLOWS entry carries it in \`gateSelftestTests\`. The expectation must never describe coverage that the structural table has dropped — restore the entry, or consciously re-make BOTH lists together.`,
		);
	}

	for (const testPath of flatDerived) {
		if (expectedSet.has(testPath)) {
			continue;
		}
		findings.push(
			`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: GATE_WORKFLOWS carries an undeclared \`gateSelftestTests\` entry for \`${testPath}\`. Every entry must be declared in EXPECTED_GATE_SELFTEST_TESTS (check-ci-gate-structure.ts) — add it there consciously, or remove the undeclared entry.`,
		);
	}

	// (3) Every declared file must exist on disk, so the expectation can
	// never describe a coverage that has been deleted.
	for (const testPath of expectedSet) {
		try {
			await access(path.join(rootDir, testPath));
		} catch {
			findings.push(
				`${GATE_SELFTEST_TESTS_EXPECTATION_HEADER}: the declared entry \`${testPath}\` points at a file that does not exist on disk. Re-point the structural table and EXPECTED_GATE_SELFTEST_TESTS at the file's reviewed new path, or remove the coverage if it was deliberately deleted.`,
			);
		}
	}

	return findings;
};

/**
 * Checks whether `onSection` (a parsed workflow's `on:` value) declares
 * `triggerKey` unconditionally: present, and carrying no restricting key at
 * all (bare `<trigger>:`, an explicit `null`, `{}`, or the array-shorthand
 * `on: [<trigger>, ...]` form, none of which can carry a filter). Shared by
 * the `pull_request` and `merge_group` trigger checks below — both must stay
 * unconditional for the same reason: any restricting key can stop the
 * trigger from firing on an ordinary event and recreate a missing/pending
 * required-check deadlock.
 *
 * Returns `{ present: true }` when unconditional, or
 * `{ present: false, foundKeys }` (`foundKeys` is `null` when the trigger key
 * is absent entirely, or the list of restricting keys found on it).
 */
// @ts-expect-error rung-0: add proper type in later rung
const checkUnconditionalTrigger = (onSection, triggerKey) => {
	if (Array.isArray(onSection)) {
		return { present: onSection.includes(triggerKey) };
	}

	if (
		onSection === null ||
		typeof onSection !== 'object' ||
		!Object.prototype.hasOwnProperty.call(onSection, triggerKey)
	) {
		return { present: false, foundKeys: null };
	}

	const triggerValue = onSection[triggerKey];
	const isUnconditional =
		triggerValue === null ||
		(typeof triggerValue === 'object' &&
			triggerValue !== null &&
			!Array.isArray(triggerValue) &&
			Object.keys(triggerValue).length === 0);

	if (isUnconditional) {
		return { present: true };
	}

	const foundKeys =
		typeof triggerValue === 'object' && triggerValue !== null
			? Object.keys(triggerValue)
			: null;

	return { present: false, foundKeys };
};

/**
 * The event names a parsed workflow's `on:` value declares, for both the
 * mapping form (`on: { pull_request: null, push: {...} }`) and the array
 * shorthand (`on: [pull_request, merge_group]`).
 */
// @ts-expect-error rung-0: add proper type in later rung
const declaredTriggerEvents = (onSection) => {
	if (Array.isArray(onSection)) {
		return onSection;
	}

	if (onSection === null || typeof onSection !== 'object') {
		return [];
	}

	return Object.keys(onSection);
};

// @ts-expect-error rung-0: add proper type in later rung
const setsEqual = (a, b) => {
	if (a.size !== b.size) {
		return false;
	}

	for (const value of a) {
		if (!b.has(value)) {
			return false;
		}
	}

	return true;
};

/**
 * Checks the sharded matrix job against the expected shard configuration.
 * Extracted from checkWorkflow to keep its complexity under the lint budget.
 */
// @ts-expect-error rung-0: add proper type in later rung
const checkMatrixJob = (matrix, matrixJob, file, findings) => {
	const { jobId, key, expected } = matrix;
	const denominator = expected.length;
	const actual = matrixJob.strategy?.matrix?.[key];
	const actualIsEqual =
		Array.isArray(actual) &&
		actual.length === expected.length &&
		actual.every((value, index) => value === expected[index]);

	if (!actualIsEqual) {
		findings.push(
			`${file}::${jobId}: expected \`strategy.matrix.${key}\` to be exactly ${JSON.stringify(expected)} (all ${denominator} shards), found ${JSON.stringify(actual ?? null)}. Narrowing this matrix silently runs a fraction of the suite while every other guard stays green.`,
		);
	}

	// Round 5 BLOCKER: pinning the `shard` array's values is not enough —
	// `matrix.exclude` (or `include`, or any other key GitHub's matrix
	// strategy accepts) can remove or redefine shard combinations while
	// `shard: [1, 2, 3, 4]` itself stays untouched. Proven: `exclude:
	// [{shard: 2}, {shard: 3}, {shard: 4}]` leaves only shard 1/4 running
	// while every other guard stayed green. `strategy.matrix` is required
	// to declare EXACTLY the one pinned axis key, nothing else.
	const matrixKeys = Object.keys(matrixJob.strategy?.matrix ?? {});

	if (matrixKeys.length !== 1 || matrixKeys[0] !== key) {
		findings.push(
			`${file}::${jobId}: expected \`strategy.matrix\` to declare EXACTLY the one key \`${key}\` (no \`exclude\`, \`include\`, or any other key that could remove or redefine shard combinations independently of the pinned array), found keys ${JSON.stringify(matrixKeys)}.`,
		);
	}

	const expectedJobName = matrixJobNameExpression({ ...matrix, file });

	if (matrixJob.name !== expectedJobName) {
		findings.push(
			`${file}::${jobId}: expected \`name: ${expectedJobName}\`, found ${JSON.stringify(matrixJob.name ?? null)}. The job name's denominator must match the matrix length, or the two can drift out of sync independently.`,
		);
	}

	const matrixSteps = Array.isArray(matrixJob.steps) ? matrixJob.steps : [];
	const shardFlag = `--shard=\${{ matrix.${key} }}/${denominator}`;
	const lastShardCheck = `if [ "\${{ matrix.${key} }}" = "${denominator}" ]`;
	const testStep = matrixSteps.find(
		// @ts-expect-error rung-0: add proper type in later rung
		(step) => typeof step?.run === 'string' && step.run.includes(shardFlag),
	);

	if (testStep === undefined) {
		findings.push(
			`${file}::${jobId}: expected a step invoking the test runner with \`${shardFlag}\`, so the shard flag's denominator cannot drift from the matrix length independently.`,
		);
	} else {
		// Any step that gates on `if [ "${{ matrix.<key> }}" = "<n>" ]`
		// (front-e2e.yml's hermetic-counter + drawer contrast runs)
		// must pin <n> to the matrix denominator — detect the pattern
		// rather than the file name, so the guard fires for any file
		// that carries such a check (and stays silent on front-ci.yml,
		// whose vitest shard has none).
		const hasAnyShardCheck = testStep.run.includes(
			`if [ "\${{ matrix.${key} }}" = "`,
		);

		if (hasAnyShardCheck && !testStep.run.includes(lastShardCheck)) {
			findings.push(
				`${file}::${jobId}: expected the shard-flag step to also gate the hermetic-counter run on \`${lastShardCheck}\` (the last shard, pinned to the same denominator as the matrix), but it does not.`,
			);
		}

		// Round 5 BLOCKER: a job/workflow-level `defaults: run: shell:
		// bash {0}` override drops bash's implicit `-e`, letting a failed
		// test command be followed (and its failure erased) by the
		// shard-selection `if`'s own exit code. Requiring the step's own
		// `run:` to start with `set -euo pipefail` makes fail-fast a
		// property of the SCRIPT ITSELF, independent of whatever shell
		// default is (or later becomes) in effect around it.
		if (!testStep.run.trimStart().startsWith('set -euo pipefail')) {
			findings.push(
				`${file}::${jobId}: expected the shard step's \`run:\` to start with \`set -euo pipefail\`, so a failed verification command cannot be masked by a later command's exit code regardless of any workflow/job-level shell default, but it does not.`,
			);
		}
	}

	// front-e2e.yml uploads Playwright reports on failure; front-ci.yml
	// uploads vitest reports. Both must carry a per-shard artifact name
	// pinned to the matrix denominator.
	const expectedUploadName =
		file === 'front-ci.yml'
			? `front-ci-vitest-report-\${{ matrix.${key} }}-of-${denominator}`
			: `front-e2e-playwright-report-\${{ matrix.${key} }}-of-${denominator}`;
	const uploadStep = matrixSteps.find(
		// @ts-expect-error rung-0: add proper type in later rung
		(step) =>
			typeof step?.with?.name === 'string' &&
			step.with.name.includes(
				file === 'front-ci.yml' ? 'vitest-report' : 'playwright-report',
			),
	);

	if (uploadStep === undefined || uploadStep.with.name !== expectedUploadName) {
		findings.push(
			`${file}::${jobId}: expected the report upload's \`with.name\` to be \`${expectedUploadName}\`, found ${JSON.stringify(uploadStep?.with?.name ?? null)}.`,
		);
	}
};

/**
 * Checks one workflow's job graph against its expected shape. Returns an
 * array of human-readable findings (empty when the graph matches).
 */
const checkWorkflow = async (
	{
		// @ts-expect-error rung-0: add proper type in later rung
		file,
		// @ts-expect-error rung-0: add proper type in later rung
		changesJob,
		// @ts-expect-error rung-0: add proper type in later rung
		gateJob,
		// @ts-expect-error rung-0: add proper type in later rung
		gateName,
		// @ts-expect-error rung-0: add proper type in later rung
		pushCheckName,
		// @ts-expect-error rung-0: add proper type in later rung
		relevanceGatedJobs,
		// @ts-expect-error rung-0: add proper type in later rung
		alwaysJobs,
		// @ts-expect-error rung-0: add proper type in later rung
		matrix,
		// @ts-expect-error rung-0: add proper type in later rung
		selfTestCoverage,
		// @ts-expect-error rung-0: add proper type in later rung
		requiresSelfCheck,
		// @ts-expect-error rung-0: add proper type in later rung
		pinnedTestFiles,
	},
	// @ts-expect-error rung-0: add proper type in later rung
	document,
	// @ts-expect-error rung-0: add proper type in later rung
	rootDir,
) => {
	const findings = [];
	const jobs = document?.jobs ?? {};

	// Round 5 BLOCKER: a workflow-level `defaults: run: shell: ...` silently
	// changes every job's shell invocation, which can drop bash's implicit
	// `-e` (see the job-level check below for the concrete exploit). There is
	// no legitimate reason for any of the four #1017 gate workflows to
	// override the default shell at the workflow level.
	if (document?.defaults !== undefined) {
		findings.push(
			`${file}: expected no workflow-level \`defaults:\` — it can silently change every job's shell invocation (e.g. dropping bash's implicit \`-e\`, letting a failed verification command be masked by a later command in the same step), found one.`,
		);
	}

	// Round 3, BLOCKER: the round-2 check only asked "does pull_request.paths
	// exist?" — if the `pull_request` key were removed entirely (or the
	// trigger swapped to workflow_dispatch, or restricted by paths-ignore/
	// types/branches/anything else), that optional-chained check silently
	// evaluates to "no paths found" and passes. Any of those recreates the
	// exact pending/missing-required-check deadlock #1017 exists to remove:
	// the required check never starts on an ordinary open/synchronize event.
	// Require the unconditional shape directly: `on.pull_request` must exist
	// and carry NO restricting keys at all (bare `pull_request:`, or
	// `on: [pull_request, ...]` array form).
	const onSection = document?.on;
	const pullRequestTrigger = checkUnconditionalTrigger(
		onSection,
		'pull_request',
	);

	if (!pullRequestTrigger.present) {
		findings.push(
			`${file}: expected an unconditional \`pull_request:\` trigger (no paths, paths-ignore, types, branches, or any other restricting key — any of those can stop the trigger from firing on an ordinary open/synchronize event and recreate the pending-check deadlock #1017 exists to fix), but ${
				pullRequestTrigger.foundKeys
					? `found restricting keys: ${JSON.stringify(pullRequestTrigger.foundKeys)}`
					: 'the trigger has no pull_request key at all'
			}.`,
		);
	}

	// Round 4 BLOCKER: all four required checks subscribed only to
	// `pull_request`. GitHub documents that a required Actions check must
	// also subscribe to `merge_group`, or a merge queue waits forever for a
	// check that is never reported for a merge-group entry — the same
	// missing-check deadlock #1017 exists to remove, just under a merge
	// queue instead of an unfiltered `pull_request.paths` trigger. The repo
	// has no merge-queue rule today (this is dormant), but a required check
	// that cannot report under a supported GitHub feature is a latent
	// version of the bug being fixed here. Held to the same unconditional
	// bar as `pull_request` for the same reason.
	const mergeGroupTrigger = checkUnconditionalTrigger(onSection, 'merge_group');

	if (!mergeGroupTrigger.present) {
		findings.push(
			`${file}: expected an unconditional \`merge_group:\` trigger (required so this check can report for a merge-queue entry — GitHub documents that a required check missing this event waits forever in a merge queue), but ${
				mergeGroupTrigger.foundKeys
					? `found restricting keys: ${JSON.stringify(mergeGroupTrigger.foundKeys)}`
					: 'the trigger has no merge_group key at all'
			}.`,
		);
	}

	// Round 6 BLOCKER, second layer: a gate workflow may subscribe ONLY to
	// pull_request, merge_group, and push. The gate job's `name:` expression
	// (below) already resolves the required check string for pull_request and
	// merge_group only, so an extra event cannot produce a second report of a
	// required context on its own — but rejecting the event outright also
	// keeps the `<workflow>-push-check` name truthful, and stops an extra
	// event from quietly duplicating even the non-required push check. Adding
	// an event here is a deliberate, reviewed decision: extend
	// ALLOWED_GATE_TRIGGER_EVENTS and decide which name the new event's runs
	// must report under.
	const unexpectedEvents = declaredTriggerEvents(onSection).filter(
		(event) => !ALLOWED_GATE_TRIGGER_EVENTS.has(event),
	);

	if (unexpectedEvents.length > 0) {
		findings.push(
			`${file}: a gate workflow may declare only ${JSON.stringify([...ALLOWED_GATE_TRIGGER_EVENTS])} in \`on:\`, found the additional event(s) ${JSON.stringify(unexpectedEvents)}. Any extra event creates another run — on a ref a maintainer chooses, for the same commit — that reports this workflow's gate job under one of its two pinned check names; \`workflow_dispatch\` in particular is documented to take a branch/tag ref and use its last commit as GITHUB_SHA.`,
		);
	}

	// #1227 BLOCKER: `github.base_ref` is only populated on `pull_request`
	// events — on `push` (and `merge_group`) it is empty, so a `git fetch
	// origin/${{ github.base_ref }}` (or any `--base origin/${{ github.base_ref }}`)
	// resolves to the literal `origin/` and abort with
	// `Diff base branch "origin/" does not exist`, taking down the whole
	// push-triggered run. develop went red on exactly this after #1193 (#1227).
	// The diff base must be resolved per event instead (the react-doctor.yml
	// fix does so via a derived `DIFF_BASE` env var). Reject the raw
	// `origin/${{ github.base_ref }}` token anywhere in a workflow that also
	// declares a `push` trigger — the only place the empty-expansion bug can
	// actually bite. A workflow with NO push subscription is exempt: there
	// `github.base_ref` is always set, so the pattern is legitimately safe.
	const declaresPush = declaredTriggerEvents(onSection).includes('push');

	if (declaresPush) {
		const badBaseToken = 'origin/${{ github.base_ref }}';
		const re = /origin\/\$\{\{\s*github\.base_ref\s*\}\}/;

		for (const [jobId, job] of Object.entries(jobs)) {
			const jobSteps = Array.isArray(job?.steps) ? job.steps : [];

			for (const [index, step] of jobSteps.entries()) {
				const haystack = [
					typeof step?.run === 'string' ? step.run : null,
					typeof step?.with === 'object' && step.with !== null
						? JSON.stringify(step.with)
						: null,
					typeof step?.env === 'object' && step.env !== null
						? JSON.stringify(step.env)
						: null,
				]
					.filter((value) => value !== null)
					.join('\n');

				if (re.test(haystack)) {
					const label =
						typeof step?.name === 'string' && step.name.trim().length > 0
							? step.name.trim()
							: `step#${index}`;

					findings.push(
						`${file}::${jobId}::${label}: uses \`${badBaseToken}\`, which expands to the literal \`origin/\` on a \`push\` (and \`merge_group\`) run — \`github.base_ref\` is empty outside \`pull_request\` — so a push-triggered run fetches/diffs against a nonexistent \`origin/\` and aborts (#1227). This workflow subscribes to \`push\`, so the diff base must be resolved per event (e.g. a derived \`DIFF_BASE\` env: \`pull_request\` -> \`origin/<base_ref>\`, \`merge_group\` -> \`\${{ github.event.merge_group.base_sha }}\`, \`push\` -> \`\${{ github.event.before }}\` with a \`HEAD~1\` fallback) and that value used for both the fetch and \`--base\`.`,
					);
				}
			}
		}
	}

	const changes = jobs[changesJob];

	if (changes === undefined) {
		findings.push(
			`${file}: expected a "${changesJob}" job, but it is missing.`,
		);
	} else {
		if (changes.if !== undefined) {
			findings.push(
				`${file}::${changesJob}: must be unconditional (no job-level \`if\`) so it always reports; found \`if: ${JSON.stringify(changes.if)}\`.`,
			);
		}

		if (changes.permissions?.['pull-requests'] !== 'read') {
			findings.push(
				`${file}::${changesJob}: must declare \`permissions: { pull-requests: read }\` to read the PR's file list; found ${JSON.stringify(changes.permissions ?? null)}.`,
			);
		}

		if (changes.permissions?.contents !== 'read') {
			findings.push(
				`${file}::${changesJob}: must declare \`permissions: { contents: read }\` — job-level \`permissions\` sets every unlisted permission to \`none\`, and \`actions/checkout\` documents \`contents: read\` as required; found ${JSON.stringify(changes.permissions ?? null)}.`,
			);
		}

		if (changes.outputs?.relevant !== EXPECTED_CHANGES_OUTPUT) {
			findings.push(
				`${file}::${changesJob}: expected \`outputs.relevant\` to be \`${EXPECTED_CHANGES_OUTPUT}\`, found ${JSON.stringify(changes.outputs?.relevant ?? null)}.`,
			);
		}

		// Round 2, finding: renaming the classifier step's `id` away from
		// `filter` leaves EXPECTED_CHANGES_OUTPUT's literal string untouched
		// (it still reads "steps.filter.outputs.relevant") but makes that
		// reference resolve empty at runtime, since no step has that id
		// anymore. The output-expression string check above cannot catch
		// this; only checking that the id actually exists as a step can.
		const steps = Array.isArray(changes.steps) ? changes.steps : [];
		const hasClassifierStepId = steps.some(
			// @ts-expect-error rung-0: add proper type in later rung
			(step) => step?.id === EXPECTED_CLASSIFIER_STEP_ID,
		);

		if (!hasClassifierStepId) {
			findings.push(
				`${file}::${changesJob}: expected a step with \`id: ${EXPECTED_CLASSIFIER_STEP_ID}\` (the classifier step \`outputs.relevant\` refers to via \`steps.${EXPECTED_CLASSIFIER_STEP_ID}.outputs.relevant\`), but no step has that id. Renaming the step's id without updating the output silently breaks the output at runtime.`,
			);
		}
	}

	for (const { id, needs } of relevanceGatedJobs) {
		const job = jobs[id];

		if (job === undefined) {
			findings.push(
				`${file}: expected a relevance-gated job "${id}", but it is missing.`,
			);
			continue;
		}

		if (job.if !== EXPECTED_RELEVANCE_IF) {
			findings.push(
				`${file}::${id}: expected \`if: ${EXPECTED_RELEVANCE_IF}\`, found ${JSON.stringify(job.if ?? null)}. Without this, the job would run unconditionally regardless of the changes classifier.`,
			);
		}

		const actualNeeds = asSet(normalizeNeeds(job.needs));
		const expectedNeeds = asSet(needs);

		if (!setsEqual(actualNeeds, expectedNeeds)) {
			findings.push(
				`${file}::${id}: expected \`needs\` to be exactly [${needs.join(', ')}], found [${[...actualNeeds].join(', ')}].`,
			);
		}

		// Round 4 BLOCKER: `continue-on-error: true` on a verification job or
		// one of its steps lets it report success after actually failing —
		// proven against this exact job by a review round while every test
		// and the drift-hash guard stayed green. This is a hard reject, not
		// a hash-reconciliation prompt: no reason can make a masked
		// verification-step failure acceptable here.
		if (job['continue-on-error']) {
			findings.push(
				`${file}::${id}: verification jobs must not set \`continue-on-error\` — it lets the job (and therefore the required gate) report success after it actually failed. Found ${JSON.stringify(job['continue-on-error'])}.`,
			);
		}

		// Round 5 BLOCKER: a job-level `defaults: run: shell: bash {0}` drops
		// bash's implicit `-e` (GitHub's documented unspecified-shell default
		// is `bash -e {0}`), so a failed command inside a multi-line `run:`
		// block no longer stops the step — a later command's exit code (e.g.
		// a shard-selection `if`) is reported instead. Proven against
		// front-e2e.yml's real Playwright step: with this override, a failed
		// test command followed by the last-shard `if` reports success.
		if (job.defaults !== undefined) {
			findings.push(
				`${file}::${id}: verification jobs must not set \`defaults:\` — a \`run.shell\` override can silently drop bash's implicit \`-e\`, letting a failed command in a multi-line \`run:\` block be masked by a later command's exit code. Found ${JSON.stringify(job.defaults)}.`,
			);
		}

		const jobSteps = Array.isArray(job.steps) ? job.steps : [];

		for (const [index, step] of jobSteps.entries()) {
			if (step?.['continue-on-error']) {
				const label =
					typeof step.name === 'string' && step.name.trim().length > 0
						? step.name.trim()
						: `step#${index}`;

				findings.push(
					`${file}::${id}: step "${label}" sets \`continue-on-error\`, which lets it fail while the verification job (and therefore the required gate) still reports success.`,
				);
			}
		}
	}

	// #1948: the matrix job is checked by the extracted helper to keep
	// checkWorkflow's complexity under the lint budget.
	if (matrix !== undefined) {
		const matrixJob = jobs[matrix.jobId];

		if (matrixJob !== undefined) {
			checkMatrixJob(matrix, matrixJob, file, findings);
		}
	}

	for (const { id, needs } of alwaysJobs) {
		const job = jobs[id];

		if (job === undefined) {
			findings.push(
				`${file}: expected an always-run job "${id}", but it is missing.`,
			);
			continue;
		}

		if (job.if !== EXPECTED_GATE_IF) {
			findings.push(
				`${file}::${id}: expected \`if: ${EXPECTED_GATE_IF}\`, found ${JSON.stringify(job.if ?? null)}.`,
			);
		}

		const actualNeeds = asSet(normalizeNeeds(job.needs));
		const expectedNeeds = asSet(needs);

		if (!setsEqual(actualNeeds, expectedNeeds)) {
			findings.push(
				`${file}::${id}: expected \`needs\` to be exactly [${needs.join(', ')}], found [${[...actualNeeds].join(', ')}].`,
			);
		}

		// Round 5 BLOCKER: same exploit as relevanceGatedJobs above, applied
		// to always-run jobs (e.g. front-e2e's GHCR `cleanup`).
		if (job.defaults !== undefined) {
			findings.push(
				`${file}::${id}: must not set \`defaults:\` — a \`run.shell\` override can silently drop bash's implicit \`-e\`, letting a failed command in a multi-line \`run:\` block be masked by a later command's exit code. Found ${JSON.stringify(job.defaults)}.`,
			);
		}
	}

	const gate = jobs[gateJob];

	if (gate === undefined) {
		findings.push(`${file}: expected a "${gateJob}" job, but it is missing.`);
	} else {
		if (gate.if !== EXPECTED_GATE_IF) {
			findings.push(
				`${file}::${gateJob}: expected \`if: ${EXPECTED_GATE_IF}\` so the required check always reports, found ${JSON.stringify(gate.if ?? null)}.`,
			);
		}

		// Round 5 BLOCKER: the round-4 continue-on-error hard-reject was
		// scoped only to relevanceGatedJobs, not the gate job itself. Adding
		// continue-on-error to the gate job (or any of its steps, e.g. "Check
		// required jobs") lets a correctly-detected aggregation failure be
		// reported as success — proven against the real "Check required
		// jobs" step while every other guard stayed green.
		if (gate['continue-on-error']) {
			findings.push(
				`${file}::${gateJob}: the required gate job itself must not set \`continue-on-error\` — it lets the job report success after it actually failed. Found ${JSON.stringify(gate['continue-on-error'])}.`,
			);
		}

		// Round 2, finding: "Rename the required check's job-level name...
		// the guard claims to pin the aggregate gates and does not pin their
		// externally required names." gate.name IS the string that must be
		// entered as a required status check in the branch ruleset.
		//
		// Round 5 BLOCKER (corrected): a bare, unconditional `gateName` string
		// is exactly what let a push-triggered run report a second, colliding
		// check under the same required name (see the file-level comment).
		// `gate.name` is now required to be the exact conditional expression
		// that reports `pushCheckName` for a `push` event and `gateName` for
		// every other event — a job that always reports (EXPECTED_GATE_IF)
		// under a name that changes with the event, instead of a job that
		// changes whether it reports under a fixed name.
		//
		// Round 6 BLOCKER (corrected again): the round-5 expression excluded
		// only `push`, so EVERY other event — including one added to `on:`
		// later — still resolved to the required name. Adding
		// `workflow_dispatch:` therefore recreated a second reporter of the
		// required context while both enforced guards stayed green. The
		// expression is now an allowlist: the required name is produced only
		// for `pull_request` and `merge_group`.
		const expectedGateNameExpr = gateNameExpression({
			gateName,
			pushCheckName,
		});

		if (gate.name !== expectedGateNameExpr) {
			findings.push(
				`${file}::${gateJob}: expected \`name: ${expectedGateNameExpr}\` (reports \`${gateName}\` — the externally required status check string — ONLY for ${REQUIRED_CONTEXT_EVENTS.join('/')} runs, and the non-required \`${pushCheckName}\` for every other event, so no run triggered by any other event can report a second, colliding check under the required name), found ${JSON.stringify(gate.name ?? null)}.`,
			);
		}

		// The decisive check: gate.needs must equal EVERY other job in the
		// file, derived from the parsed document rather than a hand-maintained
		// list here. Dropping any job from `gate.needs` — including one whose
		// `${{ needs.<job>.result }}` interpolation is still read in the gate's
		// shell body — is a structural mismatch, not just a hash change.
		const expectedGateNeeds = asSet(
			Object.keys(jobs).filter((id) => id !== gateJob),
		);
		const actualGateNeeds = asSet(normalizeNeeds(gate.needs));

		if (!setsEqual(actualGateNeeds, expectedGateNeeds)) {
			const missing = [...expectedGateNeeds].filter(
				(id) => !actualGateNeeds.has(id),
			);
			const extra = [...actualGateNeeds].filter(
				(id) => !expectedGateNeeds.has(id),
			);
			findings.push(
				`${file}::${gateJob}: \`needs\` must include every other job in the file. ` +
					(missing.length > 0 ? `Missing: [${missing.join(', ')}]. ` : '') +
					(extra.length > 0 ? `Unexpected: [${extra.join(', ')}]. ` : '') +
					"A job dropped from a required aggregate's `needs` can no longer fail the gate.",
			);
		}

		// Round 2, finding: "Add a failed job, include it in gate.needs, but
		// omit it from the hand-written Bash result map. The derived-needs
		// assertion passes, yet the gate's shell never examines the new
		// failure." Fixed at the source: the gate step now reads
		// `${{ toJSON(needs) }}` (the workflow YAML), which GitHub Actions
		// populates from `needs:` itself, so there is no second,
		// hand-maintained list that can silently omit an entry. Pin that the
		// mechanism is actually wired, not a hand-rolled map.
		const gateSteps = Array.isArray(gate.steps) ? gate.steps : [];
		const hasNeedsJsonWiring = gateSteps.some(
			// @ts-expect-error rung-0: add proper type in later rung
			(step) => step?.env?.NEEDS_JSON === EXPECTED_NEEDS_JSON_EXPR,
		);

		if (!hasNeedsJsonWiring) {
			findings.push(
				`${file}::${gateJob}: expected a step with \`env.NEEDS_JSON: ${EXPECTED_NEEDS_JSON_EXPR}\`, so job results are aggregated from the \`needs\` context itself rather than a hand-maintained Bash map that could omit an entry. Found none.`,
			);
		}

		// Round 5 BLOCKER: continue-on-error anywhere in the gate job's own
		// steps (not just relevanceGatedJobs, checked above) can mask the
		// required-jobs check's failure.
		for (const [index, step] of gateSteps.entries()) {
			if (step?.['continue-on-error']) {
				const label =
					typeof step.name === 'string' && step.name.trim().length > 0
						? step.name.trim()
						: `step#${index}`;

				findings.push(
					`${file}::${gateJob}: step "${label}" sets \`continue-on-error\`, which lets it fail while the required gate job still reports success.`,
				);
			}
		}

		// Round 5 BLOCKER: the "Check required jobs" step must carry the
		// pinned id so a sibling step can read its `outcome` (see below).
		const checkRequiredJobsStep = gateSteps.find(
			// @ts-expect-error rung-0: add proper type in later rung
			(step) =>
				step?.id === EXPECTED_CHECK_REQUIRED_JOBS_STEP_ID &&
				step?.env?.NEEDS_JSON === EXPECTED_NEEDS_JSON_EXPR,
		);

		if (checkRequiredJobsStep === undefined) {
			findings.push(
				`${file}::${gateJob}: expected the required-jobs check step (env.NEEDS_JSON: ${EXPECTED_NEEDS_JSON_EXPR}) to carry \`id: ${EXPECTED_CHECK_REQUIRED_JOBS_STEP_ID}\`, so a subsequent step can verify its \`outcome\` independently of \`continue-on-error\`. Found none.`,
			);
		}

		// Round 5 BLOCKER, the actual enforcement: GitHub computes a step's
		// `outcome` BEFORE `continue-on-error` is applied, and `conclusion`
		// AFTER — so `continue-on-error: true` on the required-jobs check
		// step cannot rewrite what a later step reads via `.outcome`. This
		// requires a step whose `run:` reads that exact expression and fails
		// when it is not "success". The hard-reject above is a second,
		// independent layer (in case continue-on-error is added to THIS step
		// instead) — neither alone depends on the other.
		const outcomeGuardExpr = `steps.${EXPECTED_CHECK_REQUIRED_JOBS_STEP_ID}.outcome`;
		const hasOutcomeGuard = gateSteps.some(
			// @ts-expect-error rung-0: add proper type in later rung
			(step) =>
				typeof step.run === 'string' && step.run.includes(outcomeGuardExpr),
		);

		if (!hasOutcomeGuard) {
			findings.push(
				`${file}::${gateJob}: expected a step whose \`run:\` reads \`${outcomeGuardExpr}\` and fails when it is not "success" — continue-on-error rewrites a step's CONCLUSION but not its raw OUTCOME, so this is what actually catches continue-on-error added to the required-jobs check step. Found none.`,
			);
		}
	}

	// Round 5 BLOCKER fix: `gate-selftest` running this very script server-side
	// is only real enforcement while it stays connected to `front-ci-gate`'s
	// `needs` — the decisive "gate.needs must equal every other job" check
	// above catches the disconnection itself, but only because
	// `front-ci-gate`'s OWN steps (not gate-selftest's) now also run this
	// script directly (see front-ci.yml's `gate` job). This asserts that
	// self-check step actually exists, so it cannot be quietly removed from
	// the one job whose result is externally required without also failing
	// this assertion.
	if (requiresSelfCheck === true) {
		const gateSteps = Array.isArray(gate?.steps) ? gate.steps : [];
		const hasSelfCheckStep = gateSteps.some(
			// @ts-expect-error rung-0: add proper type in later rung
			(step) =>
				typeof step.run === 'string' &&
				step.run.includes('check-ci-gate-structure.ts'),
		);

		if (!hasSelfCheckStep) {
			findings.push(
				`${file}::${gateJob}: expected a step whose \`run:\` invokes \`check-ci-gate-structure.mjs\` directly (this exact script, run as one of the required gate job's OWN steps — not a step in a job that could be disconnected from \`needs\`). Found none.`,
			);
		}
	}

	// IMPORTANT fix: the #1017 gate guard's own tests were reachable only
	// through local `just ci-drift` — no workflow ran them, so every guard
	// added was unenforced on the server. A `gate-selftest`-style job fixes
	// that only if it actually wakes up for a change to any file it asserts
	// against. This extracts the REAL classifier pattern from the `changes`
	// job's `filter` step (the same literal `node "$CLASSIFIER" '<pattern>'`
	// invocation scripts/ci-gate-bootstrap.test.mjs parses) and asserts it
	// matches every path in `selfTestCoverage`, so narrowing that pattern
	// back to just this one workflow file — silently reintroducing the gap —
	// is caught here.
	if (selfTestCoverage !== undefined && changes !== undefined) {
		const classifierSteps = Array.isArray(changes.steps) ? changes.steps : [];
		const filterStep = classifierSteps.find(
			// @ts-expect-error rung-0: add proper type in later rung
			(step) => step?.id === EXPECTED_CLASSIFIER_STEP_ID,
		);
		const patternMatch =
			typeof filterStep?.run === 'string'
				? filterStep.run.match(/node "\$CLASSIFIER" '([^']*)'/)
				: null;

		if (patternMatch === null) {
			findings.push(
				`${file}::${changesJob}: expected to find a \`node "$CLASSIFIER" '<pattern>'\` invocation in the filter step to check \`selfTestCoverage\` against, but found none.`,
			);
		} else {
			const pattern = new RegExp(patternMatch[1]);

			for (const requiredPath of selfTestCoverage) {
				if (!pattern.test(requiredPath)) {
					findings.push(
						`${file}::${changesJob}: the classifier pattern must match \`${requiredPath}\` (the #1017 gate guard's own tests parse/assert against this file, so a change to it must wake the guard's server-side self-test job), but it does not.`,
					);
				}
			}
		}
	}

	// PR #1312 round 1 (review MAJOR/BLOCKS_PR): a pinned test file must still
	// exist at its pinned path AND still be discovered by its runner's config
	// (matched by an `include` glob, not matched by any `exclude`). Renaming,
	// moving, deleting, or quietly excluding the file keeps the test runner
	// itself green — the file simply stops executing — so this structural
	// check is what fails the gate instead.
	if (pinnedTestFiles !== undefined) {
		for (const { path: pinnedPath, runnerConfig, reason } of pinnedTestFiles) {
			const pinnedAbsolute = path.join(rootDir, pinnedPath);
			let exists = true;

			try {
				await access(pinnedAbsolute);
			} catch {
				exists = false;
			}

			if (!exists) {
				findings.push(
					`${file}: the pinned test file \`${pinnedPath}\` is missing (${reason}). A rename, move, or delete silences that coverage while every other step stays green; re-point this pin at the file's reviewed new path.`,
				);
			}

			let runnerSource;

			try {
				runnerSource = await readFile(path.join(rootDir, runnerConfig), 'utf8');
			} catch {
				findings.push(
					`${file}: the runner config \`${runnerConfig}\` for pinned test file \`${pinnedPath}\` is missing or unreadable (${reason}); discovery cannot be verified, which fails closed.`,
				);
				continue;
			}
			// Runner globs resolve relative to the config file's own directory
			// (vitest semantics); the pin is repository-root-relative, so both
			// spellings are tried.
			const configDirectory = path.dirname(path.join(rootDir, runnerConfig));
			const candidatePaths = [
				toPosixPath(pinnedPath),
				toPosixPath(path.relative(configDirectory, pinnedAbsolute)),
			];
			const matchesPattern = (entry: string) =>
				candidatePaths.some((candidate) => globToRegExp(entry).test(candidate));
			const includes = extractStringArrayField(runnerSource, 'include');
			const excludes = extractStringArrayField(runnerSource, 'exclude') ?? [];

			if (includes === null || !includes.some(matchesPattern)) {
				findings.push(
					`${file}: no \`include\` pattern in \`${runnerConfig}\` discovers the pinned test file \`${pinnedPath}\` (${reason}), so the runner would skip it even though the gate still counts its coverage. Restore discovery in the runner config — never satisfy this check by removing or narrowing the pin.`,
				);
			}

			const excludedBy = excludes.filter(matchesPattern);

			if (excludedBy.length > 0) {
				findings.push(
					`${file}: the pinned test file \`${pinnedPath}\` is matched by the \`exclude\` pattern(s) ${JSON.stringify(excludedBy)} in \`${runnerConfig}\` (${reason}); the runner would skip it while this gate still counts its coverage.`,
				);
			}
		}
	}

	return findings;
};

/**
 * Checks every configured gate workflow. Pass `workflows` to point this at a
 * fixture set instead of the real GATE_WORKFLOWS table (tests only).
 */
export const findCiGateStructureProblems = async ({
	// @ts-expect-error rung-0: add proper type in later rung
	rootDir,
	workflows = GATE_WORKFLOWS,
}) => {
	const findings = [];

	for (const workflow of workflows) {
		const filePath = path.join(rootDir, workflowsDirectory, workflow.file);
		const raw = await readFile(filePath, 'utf8');
		const document = parse(raw);

		// @ts-expect-error rung-0: TS2345
		findings.push(...(await checkWorkflow(workflow, document, rootDir)));
	}

	// PR #1312 round 2 (review MAJOR/BLOCKS_PR): the pin-of-the-pin. Asserted
	// here so EVERY caller of this function — the real-tree self-test below,
	// gate-selftest, front-ci-gate's own step, and `just ci-drift` via this
	// script's CLI — enforces that the pinnedTestFiles entries actually exist,
	// without any new wiring that could itself be silently dropped (the exact
	// false-negative shape this closes). Fixture-based callers are unaffected:
	// the expectation is checked against the REAL table only.
	if (workflows === GATE_WORKFLOWS) {
		findings.push(...(await findPinnedTestFilesProblems({ rootDir })));
		// #1709 round 6 (review MAJOR/BLOCKS_PR): same shape, applied to
		// the `gate-selftest` step's vitest invocations. The 463-line
		// gen-reason-ref test file shipped without a CI consumer because
		// no structural check linked the workflow's `run:` block to the
		// existence of the test file. Asserted HERE (not only in a test)
		// so the real-tree self-test, this script's CLI, gate-selftest,
		// and `just ci-drift` carry it with no new wiring to drop.
		findings.push(...(await findGateSelftestTestsProblems({ rootDir })));
	}

	return findings;
};

/**
 * Round 6 BLOCKER: the check-run name a job reports under. GitHub uses the
 * job's `name:` when it has one and its job ID otherwise, so BOTH are ways
 * to claim a required context — the reviewer's reproduction renamed
 * a deleted workflow's `old-front-e2e` job to
 * `docs-archive-gate`, and a `name: docs-archive-gate` on the same job is
 * the variant scripts/check-ci-drift.mjs cannot see at all (it hashes step
 * fields only, and a `name:` addition leaves every step key untouched).
 */
// @ts-expect-error rung-0: add proper type in later rung
const reportedCheckName = (jobId, job) =>
	typeof job?.name === 'string' ? job.name : jobId;

/**
 * Round 6 BLOCKER: required-context uniqueness, scanned across EVERY workflow
 * in the repository rather than just the four gate files.
 *
 * The structure check above pins each gate job's own `name:`, but nothing
 * stopped a job in an unrelated workflow from reporting one of the four
 * required names. The reviewer proved this is not cosmetic: with
 * a deleted workflow's e2e job reporting `docs-archive-gate`,
 * the two runs on the same head commit finished four minutes apart
 * (`docs-archive-gate` at 05:29:23Z, `old-front-e2e` at 05:33:39Z — deleted workflow). Under
 * the empirically established "latest report for a context wins" behavior
 * that motivated the round-5 rename, a real gate FAILURE followed by the
 * unrelated job's later SUCCESS leaves the required context green over
 * failed required work.
 *
 * The rule, applied to every job in every `.github/workflows/*.y{a,}ml`:
 *   - the eight reserved names (four required contexts + four push checks)
 *     may be reported by exactly one job each, the authorized gate job, and
 *     only while it carries its exact pinned `name:` expression;
 *   - no other job's reported name may so much as CONTAIN a reserved name;
 *   - no other job may carry a `${{ ... }}` expression in its `name:` at
 *     all. That last rule is deliberately blunt: an expression can resolve
 *     to a reserved name without containing it literally (`${{
 *     format('{0}-gate', 'docs-archive') }}`, `${{ vars.SOMETHING }}`), and
 *     this guard cannot evaluate GitHub expressions. A new dynamic job name
 *     is therefore a reviewed decision — add it to the authorized set below
 *     — rather than something that can arrive silently. The two that exist
 *     today (the gate jobs' event-conditional name and front-e2e's sharded
 *     `test` job) are derived from the GATE_WORKFLOWS table, not
 *     hand-listed, so they cannot drift from what is pinned above.
 *
 * Pass `workflows` to point this at a fixture set (tests only).
 */
export const findRequiredContextCollisionProblems = async ({
	// @ts-expect-error rung-0: add proper type in later rung
	rootDir,
	workflows = GATE_WORKFLOWS,
}) => {
	const findings = [];

	// The eight reserved names, and which job owns each one.
	const reservedNames = new Map();

	for (const workflow of workflows) {
		const claims = [
			{ name: workflow.gateName, kind: 'externally required context' },
			{ name: workflow.pushCheckName, kind: 'non-required push check' },
		];

		for (const { name, kind } of claims) {
			const owner = reservedNames.get(name);

			if (owner !== undefined) {
				findings.push(
					`reserved check name "${name}" is claimed twice: by ${owner.file}::${owner.jobId} (${owner.kind}) and by ${workflow.file}::${workflow.gateJob} (${kind}). Every gate name and every push-check name must be distinct, or two jobs report the same context.`,
				);
				continue;
			}

			reservedNames.set(name, {
				file: workflow.file,
				jobId: workflow.gateJob,
				kind,
			});
		}
	}

	// The only jobs in the repository allowed to carry an expression in
	// `name:`, and the exact expression each must carry — both derived from
	// the same table the structure check pins against.
	const authorizedExpressionNames = new Map();

	for (const workflow of workflows) {
		authorizedExpressionNames.set(
			`${workflow.file}::${workflow.gateJob}`,
			gateNameExpression(workflow),
		);

		if (workflow.matrix !== undefined) {
			authorizedExpressionNames.set(
				`${workflow.file}::${workflow.matrix.jobId}`,
				matrixJobNameExpression({ ...workflow.matrix, file: workflow.file }),
			);
		}
	}

	const gateJobByKey = new Map(
		workflows.map((workflow) => [
			`${workflow.file}::${workflow.gateJob}`,
			workflow,
		]),
	);
	const producersByName = new Map(
		[...reservedNames.keys()].map((name) => [name, []]),
	);
	// Reserved names whose authorized job exists but carries the wrong
	// `name:`. Already reported once, precisely; the generic
	// unauthorized-reporter and zero-producer rules would add three more
	// findings each that all point back at the same job.
	const misnamedOwners = new Set();

	const directory = path.join(rootDir, workflowsDirectory);
	const workflowFiles = (await readdir(directory, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
		.map((entry) => entry.name)
		.sort();

	for (const file of workflowFiles) {
		const document = parse(await readFile(path.join(directory, file), 'utf8'));
		const jobs = document?.jobs ?? {};

		for (const [jobId, job] of Object.entries(jobs)) {
			const key = `${file}::${jobId}`;
			const name = reportedCheckName(jobId, job);
			const gateWorkflow = gateJobByKey.get(key);

			if (gateWorkflow !== undefined) {
				if (name === authorizedExpressionNames.get(key)) {
					// @ts-expect-error rung-0: TS2532
					producersByName.get(gateWorkflow.gateName).push(key);
					// @ts-expect-error rung-0: TS2532
					producersByName.get(gateWorkflow.pushCheckName).push(key);
					continue;
				}

				// The authorized job itself carries the wrong name. The
				// structure check reports the exact expected/found strings;
				// this adds the consequence for the context, once.
				findings.push(
					`${key}: is the authorized producer of "${gateWorkflow.gateName}" and "${gateWorkflow.pushCheckName}", but its \`name:\` is ${JSON.stringify(name)} rather than the pinned expression, so what it actually reports cannot be determined here.`,
				);
				misnamedOwners.add(gateWorkflow.gateName);
				misnamedOwners.add(gateWorkflow.pushCheckName);
				continue;
			}

			if (name === authorizedExpressionNames.get(key)) {
				// front-e2e's sharded `test` job: an authorized expression that
				// claims no reserved name.
				continue;
			}

			for (const [reserved, owner] of reservedNames) {
				if (name.includes(reserved)) {
					findings.push(
						`${key}: reports the check name ${JSON.stringify(name)}, which contains the reserved name "${reserved}" (${owner.kind}). Only ${owner.file}::${owner.jobId} may report it: a second job reporting the same context publishes a second, independently-timed verdict for the same commit, and GitHub keeps the LATEST one — so a later success from an unrelated job can land on top of a real gate failure.`,
					);
				}
			}

			if (name.includes('${{')) {
				findings.push(
					`${key}: its \`name:\` (${JSON.stringify(name)}) contains a GitHub expression. An expression can resolve to one of the reserved gate check names (${JSON.stringify([...reservedNames.keys()])}) without containing it literally, and this guard cannot evaluate GitHub expressions. Either give the job a static name, or add it to the authorized set in scripts/check-ci-gate-structure.mjs after checking what it can resolve to.`,
				);
			}
		}
	}

	for (const [name, producers] of producersByName) {
		if (producers.length === 1 || misnamedOwners.has(name)) {
			continue;
		}

		const owner = reservedNames.get(name);

		findings.push(
			producers.length === 0
				? `no job in .github/workflows reports the reserved check name "${name}" (${owner.kind}); expected exactly one, ${owner.file}::${owner.jobId}. A required context nothing reports blocks every pull request.`
				: `${producers.length} jobs report the reserved check name "${name}" (${owner.kind}): [${producers.join(', ')}]. Expected exactly one.`,
		);
	}

	return findings;
};

const isDirectRun =
	process.argv[1] &&
	toPosixPath(process.argv[1]).endsWith(
		'packages/scripts-ts/src/check-ci-gate-structure.ts',
	);

if (isDirectRun) {
	const findings = [
		...(await findCiGateStructureProblems({ rootDir: process.cwd() })),
		// Round 6 BLOCKER: run the whole-repository required-context
		// uniqueness scan from the SAME CLI, so it is enforced by exactly the
		// paths that already enforce the structure check — `front-ci-gate`'s
		// own "Verify the aggregate-gate job graph" step, `gate-selftest`, and
		// `just ci-drift` — rather than needing a new server-side runner of
		// its own.
		...(await findRequiredContextCollisionProblems({
			rootDir: process.cwd(),
		})),
	];

	if (findings.length > 0) {
		console.error(
			'CI gate structure guard: the aggregate-gate job graph does not match what #1017 requires:\n',
		);

		for (const finding of findings) {
			console.error(`  ${finding}\n`);
		}

		process.exit(1);
	}

	console.log(
		'CI gate structure guard: every aggregate-gate job graph matches the required shape.',
	);
}
