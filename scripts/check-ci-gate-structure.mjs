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

const workflowsDirectory = '.github/workflows';

const EXPECTED_CHANGES_OUTPUT = "${{ steps.filter.outputs.relevant }}";
const EXPECTED_CLASSIFIER_STEP_ID = 'filter';
const EXPECTED_RELEVANCE_IF = "needs.changes.outputs.relevant == 'true'";
const EXPECTED_GATE_IF = 'always()';
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
	},
	{
		file: 'front-ci.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		gateName: 'front-ci-gate',
		relevanceGatedJobs: [{ id: 'supply-chain', needs: ['changes'] }],
		alwaysJobs: [],
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
	{ file, changesJob, gateJob, gateName, relevanceGatedJobs, alwaysJobs },
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
	let hasUnconditionalPullRequest = false;

	if (Array.isArray(onSection)) {
		// Array shorthand (`on: [pull_request, push]`) cannot carry a filter at
		// all, so presence alone is unconditional.
		hasUnconditionalPullRequest = onSection.includes('pull_request');
	} else if (
		onSection !== null &&
		typeof onSection === 'object' &&
		Object.prototype.hasOwnProperty.call(onSection, 'pull_request')
	) {
		const pullRequestValue = onSection.pull_request;
		hasUnconditionalPullRequest =
			pullRequestValue === null ||
			(typeof pullRequestValue === 'object' &&
				pullRequestValue !== null &&
				!Array.isArray(pullRequestValue) &&
				Object.keys(pullRequestValue).length === 0);
	}

	if (!hasUnconditionalPullRequest) {
		const foundKeys =
			onSection !== null &&
			typeof onSection === 'object' &&
			!Array.isArray(onSection) &&
			onSection.pull_request !== null &&
			typeof onSection.pull_request === 'object'
				? Object.keys(onSection.pull_request)
				: null;

		findings.push(
			`${file}: expected an unconditional \`pull_request:\` trigger (no paths, paths-ignore, types, branches, or any other restricting key — any of those can stop the trigger from firing on an ordinary open/synchronize event and recreate the pending-check deadlock #1017 exists to fix), but ${
				foundKeys
					? `found restricting keys: ${JSON.stringify(foundKeys)}`
					: 'the trigger has no pull_request key at all'
			}.`,
		);
	}

	const changes = jobs[changesJob];

	if (changes === undefined) {
		findings.push(`${file}: expected a "${changesJob}" job, but it is missing.`);
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
			findings.push(`${file}: expected a relevance-gated job "${id}", but it is missing.`);
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
	}

	for (const { id, needs } of alwaysJobs) {
		const job = jobs[id];

		if (job === undefined) {
			findings.push(`${file}: expected an always-run job "${id}", but it is missing.`);
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
		if (gate.if !== EXPECTED_GATE_IF) {
			findings.push(
				`${file}::${gateJob}: expected \`if: ${EXPECTED_GATE_IF}\` so the required check always reports, found ${JSON.stringify(gate.if ?? null)}.`,
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
	const findings = await findCiGateStructureProblems({ rootDir: process.cwd() });

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
