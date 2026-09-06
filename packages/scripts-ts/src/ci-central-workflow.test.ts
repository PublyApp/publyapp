import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
		'front-vitest.install_dependencies","front-vitest.vitest"',
		'front-vitest.vitest"',
	);
	await writeFile(
		path.join(rootDir, '.github/workflows/ci.yml'),
		brokenLaneContract,
	);
	const mutatedFindings = await findCentralCiStructureProblems({ rootDir });
	assert.ok(
		mutatedFindings.some((finding) => /artifact contract/i.test(finding)),
	);
});
