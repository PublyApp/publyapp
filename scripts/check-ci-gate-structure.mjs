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

const workflowsDirectory = '.github/workflows';

const EXPECTED_CHANGES_OUTPUT = "${{ steps.filter.outputs.relevant }}";
const EXPECTED_RELEVANCE_IF = "needs.changes.outputs.relevant == 'true'";
const EXPECTED_GATE_IF = 'always()';

/**
 * The four #1017 aggregate-gate workflows and the job graph each one must
 * have. `relevanceGatedJobs` are jobs that only run when `changes` says the
 * workflow's paths are relevant; `alwaysJobs` are jobs (like front-e2e's
 * GHCR `cleanup`) that intentionally run regardless via their own
 * `if: always()`. `gate.needs` is not listed here — it is required to equal
 * every other job in the file, computed from the parsed document itself.
 */
const GATE_WORKFLOWS = [
	{
		file: 'front-e2e.yml',
		changesJob: 'changes',
		gateJob: 'gate',
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
		relevanceGatedJobs: [{ id: 'supply-chain', needs: ['changes'] }],
		alwaysJobs: [],
	},
	{
		file: 'openapi-spec-drift.yml',
		changesJob: 'changes',
		gateJob: 'gate',
		relevanceGatedJobs: [{ id: 'spec-drift', needs: ['changes'] }],
		alwaysJobs: [],
	},
	{
		file: 'docs-archive.yml',
		changesJob: 'changes',
		gateJob: 'gate',
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
	{ file, changesJob, gateJob, relevanceGatedJobs, alwaysJobs },
	document,
) => {
	const findings = [];
	const jobs = document?.jobs ?? {};

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

		if (changes.outputs?.relevant !== EXPECTED_CHANGES_OUTPUT) {
			findings.push(
				`${file}::${changesJob}: expected \`outputs.relevant\` to be \`${EXPECTED_CHANGES_OUTPUT}\`, found ${JSON.stringify(changes.outputs?.relevant ?? null)}.`,
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
