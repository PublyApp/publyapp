import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';
import { parse } from 'yaml';

import {
	CENTRAL_VISIBLE_CHECKS,
	findCentralCiStructureProblems,
} from './check-ci-gate-structure.ts';

const repoRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
const workflowPath = path.join(repoRoot, '.github/workflows/ci.yml');

test('central workflow exposes exactly the stable 16 display labels', async () => {
	const workflow = parse(await readFile(workflowPath, 'utf8'));
	const labels = Object.values(
		workflow.jobs as Record<
			string,
			{ name?: unknown; strategy?: { matrix?: { shard?: unknown[] } } }
		>,
	).flatMap((job) => {
		if (job.strategy?.matrix?.shard) {
			return job.strategy.matrix.shard.map((shard) =>
				String(job.name).replace('${{ matrix.shard }}', String(shard)),
			);
		}
		return [
			String(job.name).includes('ci-final-gate') ? 'ci-final-gate' : job.name,
		];
	});

	assert.deepEqual(labels, CENTRAL_VISIBLE_CHECKS);
});

test('central workflow structure rejects topology mutations', async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-central-ci-'));
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const original = await readFile(
		path.join(rootDir, '.github/workflows/ci.yml'),
		'utf8',
	);

	const mutations: Array<[string, (value: string) => string, RegExp]> = [
		[
			'front shard omitted',
			(value: string) =>
				value.replace('shard: [1, 2, 3, 4]', 'shard: [1, 2, 3]'),
			/front-vitest.*shard/i,
		],
		[
			'matrix include added',
			(value: string) =>
				value.replace(
					'fail-fast: false',
					'fail-fast: false\n      include: []',
				),
			/include/i,
		],
		[
			'gate disconnected',
			(value: string) =>
				value.replace(
					'needs: [classify, verification',
					'needs: [verification, verification',
				),
			/needs/i,
		],
		[
			'sentinel removed',
			(value: string) =>
				value.replaceAll('CI lane not applicable', 'lane omitted'),
			/sentinel/i,
		],
	];

	try {
		for (const [label, mutation, expected] of mutations) {
			await writeFile(
				path.join(rootDir, '.github/workflows/ci.yml'),
				mutation(original),
			);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) => expected.test(finding)),
				`${label} should fail: ${findings.join('; ')}`,
			);
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central workflow pins the artifact contract and report-all working directory', async () => {
	const findings = await findCentralCiStructureProblems({ rootDir: repoRoot });
	assert.deepEqual(findings, []);

	const workflow = await readFile(workflowPath, 'utf8');
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-central-contract-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const brokenLaneContract = workflow.replace(
		'front-vitest.trusted_postinstall","front-vitest.prepare_hooks"',
		'front-vitest.vitest"',
	);
	await writeFile(
		path.join(rootDir, '.github/workflows/ci.yml'),
		brokenLaneContract,
	);
	try {
		const mutatedFindings = await findCentralCiStructureProblems({ rootDir });
		assert.ok(
			mutatedFindings.some((finding) => /artifact contract/i.test(finding)),
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central structure rejects independent-check and artifact mutations', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-central-mutations-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const original = await readFile(
		path.join(rootDir, '.github/workflows/ci.yml'),
		'utf8',
	);

	const mutations: Array<[string, (value: string) => string, RegExp]> = [
		[
			'independent quality check loses always',
			(value) =>
				value.replace(
					"if: always() && needs.classify.result == 'success' && needs.classify.outputs.quality == 'true'",
					"if: needs.classify.result == 'success' && needs.classify.outputs.quality == 'true'",
				),
			/always|independent|quality/i,
		],
		[
			'result artifact is renamed',
			(value) =>
				value.replace(
					'path: ci-results/api.json',
					'path: ci-results/renamed.json',
				),
			/artifact.*(path|filename)|api\.json/i,
		],
		[
			'front report upload is removed',
			(value) =>
				value.replace(
					'name: Upload Playwright report',
					'name: Upload unrelated report',
				),
			/Playwright.*report|failure report/i,
		],
	];

	try {
		for (const [label, mutation, expected] of mutations) {
			await writeFile(
				path.join(rootDir, '.github/workflows/ci.yml'),
				mutation(original),
			);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) => expected.test(finding)),
				`${label} should fail: ${findings.join('; ')}`,
			);
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central structure rejects provenance, dataflow, and collector mutations', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-central-contract-matrix-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const original = await readFile(
		path.join(rootDir, '.github/workflows/ci.yml'),
		'utf8',
	);

	const mutations: Array<[string, (value: string) => string, RegExp]> = [
		[
			'unsupported trigger added',
			(value) =>
				value.replace(
					'  merge_group:\n  push:',
					'  merge_group:\n  workflow_dispatch:\n  push:',
				),
			/triggers must be exactly/i,
		],
		[
			'least-privilege permission widened',
			(value) => value.replace('      issues: read\n', '      issues: write\n'),
			/exact job permissions/i,
		],
		[
			'base classifier ABI marker changed',
			(value) =>
				value.replace(
					'CI_CLASSIFIER_ABI_VERSION = 2',
					'CI_CLASSIFIER_ABI_VERSION = 3',
				),
			/classifier ABI/i,
		],
		[
			'base classifier loses lanes argument',
			(value) =>
				value.replace('node "$classifier" --lanes', 'node "$classifier"'),
			/classifier ABI/i,
		],
		[
			'classifier failure can run a sentinel',
			(value) =>
				value.replace(
					"needs.classify.result == 'success' && needs.classify.outputs.e2e == 'false'",
					"needs.classify.outputs.e2e == 'false'",
				),
			/classifier failure/i,
		],
		[
			'React Doctor base is not verified',
			(value) =>
				value.replace(
					'git rev-parse --verify "$diff_base^{commit}" >/dev/null',
					'git rev-parse "$diff_base" >/dev/null',
				),
			/React Doctor base resolution/i,
		],
		[
			'result artifact allows missing file',
			(value) =>
				value.replace(
					'path: ci-results/api.json\n          if-no-files-found: error',
					'path: ci-results/api.json\n          if-no-files-found: ignore',
				),
			/artifact.*contract/i,
		],
		[
			'collector loses always',
			(value) =>
				value.replace(
					'      - name: Collect ci-lane-result\n        if: always()\n        env:\n          CI_JOB_KEY: verification',
					'      - name: Collect ci-lane-result\n        if: failure()\n        env:\n          CI_JOB_KEY: verification',
				),
			/always.*collector/i,
		],
		[
			'workflow step disappears while contract remains',
			(value) =>
				value.replace(
					"      - name: Check action versions\n        id: action_versions\n        if: always() && needs.classify.result == 'success' && needs.classify.outputs.quality == 'true'\n        continue-on-error: true\n        run: node packages/scripts-ts/src/check-actions-pinned.ts\n",
					'',
				),
			/not bound to the collector|CI_STEP_RESULTS|artifact contract/i,
		],
		[
			'workflow step outcome key disappears',
			(value) =>
				value.replace(
					',"verification.action_versions":{"outcome":"${{ steps.action_versions.outcome }}"}',
					'',
				),
			/CI_STEP_RESULTS/i,
		],
		[
			'linked issue reads webhook body',
			(value) =>
				value.replace(
					'PR_BODY="$(jq -r \'.pr.body\' "$CI_LIVE_PR_RECORD_PATH")"',
					'PR_BODY="${{ github.event.pull_request.body }}"',
				),
			/live PR record|canonical/i,
		],
		[
			'front report runner is replaced',
			(value) =>
				value.replace(
					'run: node scripts/run-guarded.mts scripts/ci/run-non-vitest-report-all.mts',
					'run: pnpm test:ci-non-vitest',
				),
			/report-all runner/i,
		],
	];

	try {
		for (const [label, mutation, expected] of mutations) {
			await writeFile(
				path.join(rootDir, '.github/workflows/ci.yml'),
				mutation(original),
			);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) => expected.test(finding)),
				`${label} should fail: ${findings.join('; ')}`,
			);
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central workflow owns the predecessor evidence as unconditional, named checks', async () => {
	const workflow = parse(await readFile(workflowPath, 'utf8')) as {
		jobs: Record<string, { steps?: Array<Record<string, unknown>> }>;
	};
	const verification = workflow.jobs.verification.steps ?? [];
	const stepNames = verification.map((step) => String(step.name));

	for (const name of [
		'Check no ignored tracked files',
		'Check no dockerignore shadow files',
		'Check dependency health contract',
		'Check action SHA bindings',
		'Check deploy environment documentation',
		'Run analyzer tests',
	]) {
		assert.ok(
			stepNames.includes(name),
			`central verification must own ${name}`,
		);
	}

	for (const step of verification.filter((candidate) =>
		[
			'Check no ignored tracked files',
			'Check no dockerignore shadow files',
		].includes(String(candidate.name)),
	)) {
		assert.equal(
			step.if,
			'always()',
			`${String(step.name)} must be unconditional`,
		);
	}
});

test('central workflow pins full-history React Doctor resolution and all E2E evidence', async () => {
	const workflow = await readFile(workflowPath, 'utf8');
	assert.match(workflow, /fetch-depth: 0/);
	assert.match(workflow, /CI_REACT_DOCTOR_BASE/);
	assert.match(workflow, /git rev-parse --verify/);
	assert.match(workflow, /chromium-hermetic-source/);
	assert.match(workflow, /drawer-contrast/);
	assert.match(workflow, /Upload Playwright report/);
	assert.match(workflow, /docker compose .* down -v/);
	assert.match(
		workflow,
		/front api request-counter traefik toxiproxy postgres/,
	);
	assert.match(workflow, /GITHUB_SHA: \$\{\{ github\.sha \}\}/);
	assert.match(workflow, /GITHUB_EVENT_NAME: \$\{\{ github\.event_name \}\}/);
});
