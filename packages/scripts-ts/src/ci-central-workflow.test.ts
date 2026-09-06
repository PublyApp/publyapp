import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';
import { parse } from 'yaml';

import {
	CENTRAL_VISIBLE_CHECKS,
	findCentralCiStructureProblems,
	findRequiredContextCollisionProblems,
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

test('central workflow rejects the complete ratified topology mutation matrix', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-central-matrix-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const workflowFile = path.join(rootDir, '.github/workflows/ci.yml');
	const original = await readFile(workflowFile, 'utf8');
	const jobBlock =
		(jobId: string, mutate: (block: string) => string) => (value: string) => {
			const start = value.indexOf(`  ${jobId}:\n`);
			assert.notEqual(start, -1, `${jobId} fixture job missing`);
			let next = value.indexOf('\n  ', start + 3);
			while (next !== -1 && value[next + 3] === ' ') {
				next = value.indexOf('\n  ', next + 1);
			}
			const end = next === -1 ? value.length : next;
			return `${value.slice(0, start)}${mutate(value.slice(start, end))}${value.slice(end)}`;
		};
	const mutations: Array<[string, (value: string) => string, RegExp]> = [
		[
			'front shard omitted',
			(value) => value.replace('shard: [1, 2, 3, 4]', 'shard: [1, 2, 3]'),
			/shard axis|expanded display/i,
		],
		[
			'e2e shard omitted',
			(value) => {
				const marker = '  e2e-test:';
				const start = value.indexOf(marker);
				const suffix = value
					.slice(start)
					.replace('shard: [1, 2, 3, 4]', 'shard: [1, 2, 3]');
				return `${value.slice(0, start)}${suffix}`;
			},
			/shard axis|expanded display/i,
		],
		[
			'matrix exclude added',
			(value) =>
				value.replace(
					'fail-fast: false\n      matrix:',
					'fail-fast: false\n      exclude: []\n      matrix:',
				),
			/include\/exclude|matrix/i,
		],
		[
			'fail-fast widened',
			(value) => value.replace('fail-fast: false', 'fail-fast: true'),
			/fail-fast/i,
		],
		[
			'front matrix needs changed',
			jobBlock('front-vitest', (block) =>
				block.replace('needs: classify', 'needs: verification'),
			),
			/needs|front-vitest/i,
		],
		[
			'e2e matrix needs changed',
			(value) =>
				value.replace('needs: [classify, e2e-build]', 'needs: [classify]'),
			/needs|e2e-test/i,
		],
		[
			'job-level relevance condition added',
			jobBlock('front-vitest', (block) =>
				block.replace(
					'if: always()',
					"if: needs.classify.outputs.front == 'true'",
				),
			),
			/relevance|front-vitest/i,
		],
		[
			'forced skip added',
			(value) =>
				value.replace(
					"if: always() && needs.classify.result == 'success' && needs.classify.outputs.quality == 'true'",
					'if: false',
				),
			/always|tolerated|independent/i,
		],
		[
			'final reducer tolerated',
			(value) =>
				value.replace(
					'        run: node packages/scripts-ts/src/check-ci-gate-aggregation.ts ci-results',
					'        continue-on-error: true\n        run: node packages/scripts-ts/src/check-ci-gate-aggregation.ts ci-results',
				),
			/reducer|continue-on-error/i,
		],
		[
			'whole artifact merge enabled',
			(value) =>
				value.replace(
					'          path: ci-results\n',
					'          path: ci-results\n          merge-multiple: true\n',
				),
			/merge-multiple|container/i,
		],
		[
			'gate renamed',
			(value) => value.replace("'ci-final-gate'", "'renamed-gate'"),
			/display-name|name/i,
		],
	];

	try {
		for (const [label, mutation, expected] of mutations) {
			await writeFile(workflowFile, mutation(original));
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) => expected.test(finding)),
				`${label} should fail: ${findings.join('; ')}`,
			);
		}

		for (const jobId of [
			'classify',
			'verification',
			'audit-development',
			'audit-production',
			'api',
			'front-vitest',
			'e2e-build',
			'e2e-test',
			'e2e-cleanup',
			'gate',
		]) {
			await writeFile(
				workflowFile,
				jobBlock(jobId, (block) =>
					block.replace('contents: read', 'contents: write'),
				)(original),
			);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) => /permissions/i.test(finding)),
				`${jobId} permission mutation should fail: ${findings.join('; ')}`,
			);
		}

		await writeFile(
			path.join(rootDir, '.github/workflows/docs-archive.yml'),
			`${await readFile(path.join(rootDir, '.github/workflows/docs-archive.yml'), 'utf8')}\n  forged:\n    name: ci-final-gate\n    runs-on: ubuntu-latest\n    steps:\n      - run: true\n`,
		);
		const collisionFindings = await findRequiredContextCollisionProblems({
			rootDir,
		});
		assert.ok(
			collisionFindings.some((finding) =>
				/reserved check name|ci-final-gate/i.test(finding),
			),
			`second producer should fail: ${collisionFindings.join('; ')}`,
		);
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

test('central workflow uses independently supplied GitHub workflow provenance', async () => {
	const workflow = await readFile(workflowPath, 'utf8');
	assert.match(workflow, /CI_WORKFLOW_REF: \$\{\{ github\.workflow_ref \}\}/);
	assert.doesNotMatch(workflow, /CI_WORKFLOW_ID:\s*central ci/);
});

test('tolerated test diagnostics run only for failure or cancellation', async () => {
	const workflow = parse(await readFile(workflowPath, 'utf8')) as {
		jobs: Record<string, { steps?: Array<Record<string, unknown>> }>;
	};
	const expected = [
		['api', 'Upload API test results', 'suite'],
		['front-vitest', 'Upload Vitest report', 'vitest'],
		['e2e-test', 'Upload Playwright report', 'playwright'],
	] as const;

	for (const [jobId, stepName, stepId] of expected) {
		const step = workflow.jobs[jobId].steps?.find(
			(candidate) => candidate.name === stepName,
		);
		assert.equal(
			step?.if,
			`always() && (steps.${stepId}.outcome == 'failure' || steps.${stepId}.outcome == 'cancelled')`,
			`${jobId} diagnostic upload must not depend on failure() after continue-on-error`,
		);
	}

	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-diagnostic-mutation-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const workflowFile = path.join(rootDir, '.github/workflows/ci.yml');
	const original = await readFile(workflowFile, 'utf8');
	try {
		for (const [jobId, stepName, stepId] of expected) {
			const expectedCondition = `always() && (steps.${stepId}.outcome == 'failure' || steps.${stepId}.outcome == 'cancelled')`;
			const mutation = original.replace(
				`if: ${expectedCondition}`,
				'if: failure()',
			);
			await writeFile(workflowFile, mutation);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) => finding.includes(`${jobId}: ${stepName}`)),
				`${jobId} diagnostic mutation should fail: ${findings.join('; ')}`,
			);
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central trigger filters are rejected in every filtered form', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-trigger-matrix-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const original = await readFile(
		path.join(rootDir, '.github/workflows/ci.yml'),
		'utf8',
	);
	const mutations = [
		[
			'pull_request paths',
			'  pull_request:\n    types:',
			'  pull_request:\n    paths: [apps/front/**]\n    types:',
			/trigger|pull_request/i,
		],
		[
			'pull_request paths-ignore',
			'  pull_request:\n    types:',
			'  pull_request:\n    paths-ignore: [docs/**]\n    types:',
			/trigger|pull_request/i,
		],
		[
			'pull_request branches',
			'  pull_request:\n    types:',
			'  pull_request:\n    branches: [develop]\n    types:',
			/trigger|pull_request/i,
		],
		[
			'merge_group branches',
			'  merge_group:\n',
			'  merge_group:\n    branches: [develop]\n',
			/trigger|merge_group/i,
		],
		[
			'push paths',
			'  push:\n    branches:',
			'  push:\n    paths: [apps/front/**]\n    branches:',
			/push|trigger/i,
		],
		[
			'push paths-ignore',
			'  push:\n    branches:',
			'  push:\n    paths-ignore: [docs/**]\n    branches:',
			/push|trigger/i,
		],
		[
			'push extra key',
			'  push:\n    branches:',
			'  push:\n    branches: [develop]\n    paths: []\n',
			/push|trigger/i,
		],
	] as const;

	try {
		for (const [label, needle, replacement, expected] of mutations) {
			assert.ok(original.includes(needle), `${label} fixture needle missing`);
			await writeFile(
				path.join(rootDir, '.github/workflows/ci.yml'),
				original.replace(needle, replacement),
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

test('central manifest does not describe locally mirrored commands as GitHub-only', async () => {
	const manifest = JSON.parse(
		await readFile(
			path.join(repoRoot, 'packages/scripts-ts/src/ci-gate-manifest.json'),
			'utf8',
		),
	) as { steps: Record<string, { mirror: string | null; reason: string }> };
	const expectedMirrors = new Map([
		['ci.yml::api::Run full API test suite', 'just test-api'],
		['ci.yml::verification::Check formatting', 'just format'],
		['ci.yml::verification::Build front', 'just ci-front'],
		[
			'ci.yml::verification::Test front (non-vitest report-all)',
			'just ci-front',
		],
		['ci.yml::e2e-test::Run Playwright shard', 'just ci-e2e-front'],
		[
			'ci.yml::e2e-cleanup::Cleanup e2e images',
			'pnpm --filter scripts-ts exec vitest run src/ci-e2e-cleanup.test.ts',
		],
	]);

	for (const [id, mirror] of expectedMirrors) {
		assert.equal(manifest.steps[id]?.mirror, mirror, `${id} mirror`);
	}
	for (const [id, entry] of Object.entries(manifest.steps)) {
		if (!id.startsWith('ci.yml::')) {
			continue;
		}
		assert.ok(entry.reason.length >= 24, `${id} reason length`);
		assert.doesNotMatch(
			entry.reason,
			/central CI (?:topology|gate inventory).*no separate local execution surface/i,
			`${id} generic reason`,
		);
	}
});
