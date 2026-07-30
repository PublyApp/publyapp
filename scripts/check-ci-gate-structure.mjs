import { readFile } from 'node:fs/promises';
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
// close the same underlying risk class. Fixed uniformly across all four
// workflows (including `front-ci.yml`, which has no `push` trigger today, so
// one added later inherits the same protection): the required `gate` job's
// own `if:` now also requires the event to be `pull_request` or
// `merge_group`, so a push-triggered run never reports (or re-reports) the
// required context at all — the underlying push-triggered verification jobs
// still run to validate the direct push itself, only the required-check
// reporting is scoped.
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

const workflowsDirectory = '.github/workflows';

const EXPECTED_CHANGES_OUTPUT = '${{ steps.filter.outputs.relevant }}';
const EXPECTED_CLASSIFIER_STEP_ID = 'filter';
const EXPECTED_RELEVANCE_IF = "needs.changes.outputs.relevant == 'true'";
// Used for always-run jobs that are NOT the externally required gate itself
// (e.g. front-e2e's GHCR `cleanup`) — those have no reason to skip a `push`
// run, since nothing external depends on their name as a required context.
const EXPECTED_GATE_IF = 'always()';
// Round 5 BLOCKER: the required gate job's own `if:`. Unlike EXPECTED_GATE_IF
// above, this also scopes reporting to the events where a required context
// is actually meaningful — see the file-level comment.
const EXPECTED_REQUIRED_GATE_IF =
	"always() && (github.event_name == 'pull_request' || github.event_name == 'merge_group')";
const EXPECTED_NEEDS_JSON_EXPR = '${{ toJSON(needs) }}';

/**
 * The four #1017 aggregate-gate workflows and the job graph each one must
 * have. `relevanceGatedJobs` are jobs that only run when `changes` says the
 * workflow's paths are relevant; `alwaysJobs` are jobs (like front-e2e's
 * GHCR `cleanup`) that intentionally run regardless via their own
 * `if: always()`. `gate.needs` is not listed here — it is required to equal
 * every other job in the file, computed from the parsed document itself.
 * `gateName` is the externally required check string.
 */
const GATE_WORKFLOWS = [
	{
		file: 'front-e2e.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'front-e2e-gate',
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
		relevanceGatedJobs: [
			{ id: 'supply-chain', needs: ['changes'] },
			{ id: 'gate-selftest', needs: ['changes'] },
		],
		alwaysJobs: [],
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
		selfTestCoverage: [
			'.github/workflows/front-ci.yml',
			'.github/workflows/front-e2e.yml',
			'.github/workflows/openapi-spec-drift.yml',
			'.github/workflows/docs-archive.yml',
			'scripts/ci-changed-paths.mjs',
			'scripts/check-ci-drift.mjs',
			'scripts/check-ci-gate-structure.mjs',
		],
		// Round 5 BLOCKER fix: front-ci-gate must independently re-derive its
		// own job graph's correctness rather than relying solely on
		// gate-selftest (see the file-level comment).
		requiresSelfCheck: true,
	},
	{
		file: 'openapi-spec-drift.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'openapi-spec-drift-gate',
		relevanceGatedJobs: [{ id: 'spec-drift', needs: ['changes'] }],
		alwaysJobs: [],
	},
	{
		file: 'docs-archive.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'docs-archive-gate',
		relevanceGatedJobs: [{ id: 'docs-archive', needs: ['changes'] }],
		alwaysJobs: [],
	},
];

const toPosixPath = (value) => value.split(path.sep).join('/');

/** Normalizes a job's `needs` (string | string[] | undefined) to an array. */
const normalizeNeeds = (needs) => {
	if (needs === undefined) {
		return [];
	}

	return Array.isArray(needs) ? needs : [needs];
};

const asSet = (values) => new Set(values);

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
 * Checks one workflow's job graph against its expected shape. Returns an
 * array of human-readable findings (empty when the graph matches).
 */
const checkWorkflow = (
	{
		file,
		changesJob,
		gateJob,
		gateName,
		relevanceGatedJobs,
		alwaysJobs,
		matrix,
		selfTestCoverage,
		requiresSelfCheck,
	},
	document,
) => {
	const findings = [];
	const jobs = document?.jobs ?? {};

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

	if (matrix !== undefined) {
		const { jobId, key, expected } = matrix;
		const matrixJob = jobs[jobId];

		if (matrixJob === undefined) {
			// Already reported above (matrixJob is always a relevanceGatedJobs
			// entry), so nothing further to add here.
		} else {
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

			const expectedJobName = `front-e2e (\${{ matrix.${key} }}/${denominator})`;

			if (matrixJob.name !== expectedJobName) {
				findings.push(
					`${file}::${jobId}: expected \`name: ${expectedJobName}\`, found ${JSON.stringify(matrixJob.name ?? null)}. The job name's denominator must match the matrix length, or the two can drift out of sync independently.`,
				);
			}

			const matrixSteps = Array.isArray(matrixJob.steps) ? matrixJob.steps : [];
			const shardFlag = `--shard=\${{ matrix.${key} }}/${denominator}`;
			const lastShardCheck = `if [ "\${{ matrix.${key} }}" = "${denominator}" ]`;
			const testStep = matrixSteps.find(
				(step) => typeof step?.run === 'string' && step.run.includes(shardFlag),
			);

			if (testStep === undefined) {
				findings.push(
					`${file}::${jobId}: expected a step invoking Playwright with \`${shardFlag}\`, so the shard flag's denominator cannot drift from the matrix length independently.`,
				);
			} else if (!testStep.run.includes(lastShardCheck)) {
				findings.push(
					`${file}::${jobId}: expected the shard-flag step to also gate the hermetic-counter run on \`${lastShardCheck}\` (the last shard, pinned to the same denominator as the matrix), but it does not.`,
				);
			}

			const expectedUploadName = `front-e2e-playwright-report-\${{ matrix.${key} }}-of-${denominator}`;
			const uploadStep = matrixSteps.find(
				(step) =>
					typeof step?.with?.name === 'string' &&
					step.with.name.includes('playwright-report'),
			);

			if (
				uploadStep === undefined ||
				uploadStep.with.name !== expectedUploadName
			) {
				findings.push(
					`${file}::${jobId}: expected the Playwright report upload's \`with.name\` to be \`${expectedUploadName}\`, found ${JSON.stringify(uploadStep?.with?.name ?? null)}.`,
				);
			}
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
	}

	const gate = jobs[gateJob];

	if (gate === undefined) {
		findings.push(`${file}: expected a "${gateJob}" job, but it is missing.`);
	} else {
		if (gate.if !== EXPECTED_REQUIRED_GATE_IF) {
			findings.push(
				`${file}::${gateJob}: expected \`if: ${EXPECTED_REQUIRED_GATE_IF}\` so the required check always reports for pull_request/merge_group but never (re-)reports for a push-triggered run of the same commit — GitHub keeps only the latest status for a context, so a push run could otherwise overwrite a passing pull_request run — found ${JSON.stringify(gate.if ?? null)}.`,
			);
		}

		// Round 2, finding: "Rename the required check's job-level name...
		// the guard claims to pin the aggregate gates and does not pin their
		// externally required names." gate.name IS the string that must be
		// entered as a required status check in the branch ruleset.
		if (gate.name !== gateName) {
			findings.push(
				`${file}::${gateJob}: expected \`name: ${gateName}\` (the externally required status check string), found ${JSON.stringify(gate.name ?? null)}.`,
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
			(step) => step?.env?.NEEDS_JSON === EXPECTED_NEEDS_JSON_EXPR,
		);

		if (!hasNeedsJsonWiring) {
			findings.push(
				`${file}::${gateJob}: expected a step with \`env.NEEDS_JSON: ${EXPECTED_NEEDS_JSON_EXPR}\`, so job results are aggregated from the \`needs\` context itself rather than a hand-maintained Bash map that could omit an entry. Found none.`,
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
			(step) =>
				typeof step.run === 'string' &&
				step.run.includes('check-ci-gate-structure.mjs'),
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

	return findings;
};

/**
 * Checks every configured gate workflow. Pass `workflows` to point this at a
 * fixture set instead of the real GATE_WORKFLOWS table (tests only).
 */
export const findCiGateStructureProblems = async ({
	rootDir,
	workflows = GATE_WORKFLOWS,
}) => {
	const findings = [];

	for (const workflow of workflows) {
		const filePath = path.join(rootDir, workflowsDirectory, workflow.file);
		const raw = await readFile(filePath, 'utf8');
		const document = parse(raw);

		findings.push(...checkWorkflow(workflow, document));
	}

	return findings;
};

const isDirectRun =
	process.argv[1] &&
	toPosixPath(process.argv[1]).endsWith('scripts/check-ci-gate-structure.mjs');

if (isDirectRun) {
	const findings = await findCiGateStructureProblems({
		rootDir: process.cwd(),
	});

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
