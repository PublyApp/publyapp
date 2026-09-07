import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
import {
	CI_CONTRACT_TEST_FILES,
	validateCiContractTestFiles,
} from './ci-contract-test-files.ts';

const repoRoot = path.resolve(new URL('../../..', import.meta.url).pathname);
const workflowPath = path.join(repoRoot, '.github/workflows/ci.yml');

const removeStepIf = (workflow: string, stepId: string): string => {
	const escapedStepId = stepId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(
		`(^\\s+- name:[^\\n]*\\n\\s+id: ${escapedStepId}\\n)\\s+if: [^\\n]*\\n`,
		'm',
	);
	return workflow.replace(pattern, '$1');
};

const e2eConditionDeletionCases = [
	['e2e-build', 'image-tag'],
	['e2e-build', 'image-root'],
	['e2e-build', 'image-fork'],
	['e2e-build', 'setup-buildx'],
	['e2e-build', 'setup-runtime'],
	['e2e-build', 'login'],
	['e2e-test', 'install-pnpm'],
	['e2e-test', 'setup-node'],
	['e2e-test', 'login'],
	['e2e-test', 'download-images'],
	['e2e-test', 'cache-playwright'],
] as const;

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

test('central workflow contract command names the real complete contract suite', async () => {
	const workflow = await readFile(workflowPath, 'utf8');
	const directRunner = 'node packages/scripts-ts/src/run-ci-contract-tests.ts';
	assert.match(
		workflow,
		new RegExp(`run: ${directRunner.replaceAll('/', '\\/')}`),
	);
	assert.doesNotMatch(workflow, /check-ci-gate-aggregation\.test\.ts/);
	assert.ok(CI_CONTRACT_TEST_FILES.includes('src/ci-central-workflow.test.ts'));
	assert.ok(CI_CONTRACT_TEST_FILES.includes('src/ci-gate-aggregation.test.ts'));
	assert.deepEqual(validateCiContractTestFiles(repoRoot), []);
	assert.deepEqual(
		validateCiContractTestFiles(path.join(repoRoot, 'missing')),
		[...CI_CONTRACT_TEST_FILES],
	);
	const justfile = await readFile(path.join(repoRoot, 'justfile'), 'utf8');
	assert.match(justfile, new RegExp(directRunner.replaceAll('/', '\\/')));
	assert.doesNotMatch(justfile, /ci-drift:[\s\S]*pnpm test:ci-contracts/);

	const manifest = JSON.parse(
		await readFile(
			path.join(repoRoot, 'packages/scripts-ts/src/ci-gate-manifest.json'),
			'utf8',
		),
	) as { steps: Record<string, { mirror: string | null }> };
	assert.equal(
		manifest.steps['ci.yml::verification::Test CI contracts']?.mirror,
		'just ci-drift',
	);
});

test('hosted and local contract authorities survive a zero-test package-script decoy', async () => {
	const workflow = await readFile(workflowPath, 'utf8');
	const justfile = await readFile(path.join(repoRoot, 'justfile'), 'utf8');
	const packageJson = JSON.parse(
		await readFile(path.join(repoRoot, 'package.json'), 'utf8'),
	) as { scripts: Record<string, string> };
	packageJson.scripts['test:ci-contracts'] =
		`node -e "console.log('decoy contract pass')"`;
	const directRunner = 'node packages/scripts-ts/src/run-ci-contract-tests.ts';
	assert.equal(validateCiContractTestFiles(repoRoot).length, 0);
	assert.match(workflow, new RegExp(directRunner.replaceAll('/', '\\/')));
	assert.match(justfile, new RegExp(directRunner.replaceAll('/', '\\/')));
	assert.doesNotMatch(workflow, /pnpm test:ci-contracts/);
	assert.doesNotMatch(justfile, /pnpm test:ci-contracts/);
});

test('central workflow rejects every CI_STEP_RESULTS outcome edge mutation and duplicate result producer', async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-ci-outcome-'));
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const workflowFile = path.join(rootDir, '.github/workflows/ci.yml');
	const original = await readFile(workflowFile, 'utf8');
	const mutations = [
		[
			'api suite outcome points at checkout',
			original.replace(
				'"api.suite":{"outcome":"${{ steps.suite.outcome }}"}',
				'"api.suite":{"outcome":"${{ steps.checkout.outcome }}"}',
			),
		],
		[
			'verification lint outcome points at format',
			original.replace(
				'"verification.lint":{"outcome":"${{ steps.lint.outcome }}"}',
				'"verification.lint":{"outcome":"${{ steps.format.outcome }}"}',
			),
		],
		[
			'every result uploader has exactly one producer',
			original.replace(
				'          if-no-files-found: error\n\n  verification:',
				'          if-no-files-found: error\n      - name: Duplicate result upload\n        if: always()\n        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0\n        with:\n          name: ci-lane-result-${{ github.run_id }}-${{ github.run_attempt }}-classify\n          path: ci-results/classify.json\n          if-no-files-found: error\n\n  verification:',
			),
		],
		[
			'result uploader overwrite contract changes',
			original.replace(
				'          if-no-files-found: error\n\n  verification:',
				'          if-no-files-found: error\n          overwrite: true\n\n  verification:',
			),
		],
		[
			'dynamically equivalent forged result producer is rejected',
			original.replace(
				'          if-no-files-found: error\n\n  verification:',
				`          if-no-files-found: error
	      - name: Forge result producer
	        if: always()
	        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0
	        with:
	          name: \${{ format('ci-lane-result-{0}-{1}-classify', github.run_id, github.run_attempt) }}
	          path: ci-results/classify.json
	          if-no-files-found: error
	          overwrite: true

  verification:`,
			),
		],
	] as const;
	try {
		for (const [label, mutation] of mutations) {
			await writeFile(workflowFile, mutation);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) =>
					/outcome|producer|upload|overwrite|artifact/i.test(finding),
				),
				`${label} should fail: ${findings.join('; ')}`,
			);
		}

		const outcomeBindings = [
			...original.matchAll(
				/"([^"]+)":\{"outcome":"\$\{\{ steps\.([^}]+)\.outcome \}\}"\}/g,
			),
		];
		assert.ok(
			outcomeBindings.length > 0,
			'CI_STEP_RESULTS must expose outcomes',
		);
		for (const [, key, stepId] of outcomeBindings) {
			const wrongStepId = stepId === 'checkout' ? 'classifier' : 'checkout';
			const originalBinding = `"${key}":{"outcome":"\${{ steps.${stepId}.outcome }}"}`;
			const mutation = original.replace(
				originalBinding,
				`"${key}":{"outcome":"\${{ steps.${wrongStepId}.outcome }}"}`,
			);
			assert.notEqual(
				mutation,
				original,
				`${key} mutation must change the fixture`,
			);
			await writeFile(workflowFile, mutation);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) =>
					/outcome|CI_STEP_RESULTS|collector/i.test(finding),
				),
				`${key} outcome edge should fail: ${findings.join('; ')}`,
			);
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central workflow rejects every classifier producer, consumer, relevance, sentinel, and parent-result edge swap', async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-ci-edges-'));
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const workflowFile = path.join(rootDir, '.github/workflows/ci.yml');
	const original = await readFile(workflowFile, 'utf8');
	const swaps = [
		[
			'quality',
			'${{ steps.classifier.outputs.front }}',
			'${{ steps.classifier.outputs.quality }}',
		],
		[
			'front',
			'${{ steps.classifier.outputs.quality }}',
			'${{ steps.classifier.outputs.front }}',
		],
		[
			'api',
			'${{ steps.classifier.outputs.front }}',
			'${{ steps.classifier.outputs.api }}',
		],
		[
			'e2e',
			'${{ steps.classifier.outputs.api }}',
			'${{ steps.classifier.outputs.e2e }}',
		],
		[
			'docs',
			'${{ steps.classifier.outputs.e2e }}',
			'${{ steps.classifier.outputs.docs }}',
		],
		[
			'react',
			'${{ steps.classifier.outputs.docs }}',
			'${{ steps.classifier.outputs.react }}',
		],
	] as const;
	try {
		for (const [name, wrong, right] of swaps) {
			const mutation = original.replace(
				`${name}: ${right}`,
				`${name}: ${wrong}`,
			);
			await writeFile(workflowFile, mutation);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) =>
					/classifier|output|edge|binding/i.test(finding),
				),
				`${name} producer edge should fail: ${findings.join('; ')}`,
			);
		}
		const falseConditionMutation = original.replace(
			"always() && needs.classify.result == 'success' && needs.classify.outputs.api == 'true'",
			"always() && needs.classify.result == 'success' && needs.classify.outputs.api == 'true' && false",
		);
		await writeFile(workflowFile, falseConditionMutation);
		const falseConditionFindings = await findCentralCiStructureProblems({
			rootDir,
		});
		assert.ok(
			falseConditionFindings.some((finding) =>
				/condition|classifier|output|edge|binding/i.test(finding),
			),
			`API condition appends false should fail: ${falseConditionFindings.join('; ')}`,
		);
		const apiCondition =
			"always() && needs.classify.result == 'success' && needs.classify.outputs.api == 'true'";
		const conditionMutations = [
			[
				'API condition prepends false',
				`always() && false && needs.classify.result == 'success' && needs.classify.outputs.api == 'true'`,
			],
			['API condition appends true', `${apiCondition} || true`],
			[
				'API condition duplicates classifier result',
				`${apiCondition} && needs.classify.result == 'success'`,
			],
			[
				'API condition reorders semantic sources',
				"always() && needs.classify.outputs.api == 'true' && needs.classify.result == 'success'",
			],
			[
				'API condition uses dynamic expression',
				"always() && needs.classify.result == 'success' && needs.classify.outputs.api == '${{ matrix.api }}'",
			],
		] as const;
		for (const [label, replacement] of conditionMutations) {
			await writeFile(
				workflowFile,
				original.replace(apiCondition, replacement),
			);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) =>
					/condition|classifier|output|edge|binding/i.test(finding),
				),
				`${label} should fail: ${findings.join('; ')}`,
			);
		}

		const collectorSwap = original.replace(
			'CI_CLASSIFIER_OUTPUTS: \'{"api":"${{ needs.classify.outputs.api }}"}\'',
			'CI_CLASSIFIER_OUTPUTS: \'{"api":"${{ needs.classify.outputs.front }}"}\'',
		);
		await writeFile(workflowFile, collectorSwap);
		assert.ok(
			(await findCentralCiStructureProblems({ rootDir })).some((finding) =>
				/classifier|output|binding/i.test(finding),
			),
		);

		const parentSwap = original.replace(
			'"api":"${{ needs.api.result }}"',
			'"api":"${{ needs.front-vitest.result }}"',
		);
		await writeFile(workflowFile, parentSwap);
		assert.ok(
			(await findCentralCiStructureProblems({ rootDir })).some((finding) =>
				/parent|central|result|binding/i.test(finding),
			),
		);

		const relevanceSwap = original.replace(
			"needs.classify.outputs.api == 'true'",
			"needs.classify.outputs.front == 'true'",
		);
		await writeFile(workflowFile, relevanceSwap);
		assert.ok(
			(await findCentralCiStructureProblems({ rootDir })).some((finding) =>
				/relevance|classifier|consumer|consume|binding|needs\.classify/i.test(
					finding,
				),
			),
		);

		const classifierLines = original
			.split('\n')
			.filter((line) => line.includes('CI_CLASSIFIER_OUTPUTS:'));
		assert.ok(
			classifierLines.length > 0,
			'classifier consumers must be present',
		);
		for (const line of classifierLines) {
			const json = line.match(/CI_CLASSIFIER_OUTPUTS: '([^']+)'/)?.[1];
			assert.ok(json, `classifier line must contain JSON: ${line}`);
			const values = Object.entries(JSON.parse(json) as Record<string, string>);
			for (const [key, value] of values) {
				const replacementValue = [
					...values.map(([, candidateValue]) => candidateValue),
					'${{ needs.classify.outputs.quality }}',
					'${{ needs.classify.outputs.front }}',
					'${{ needs.classify.outputs.api }}',
					'${{ needs.classify.outputs.e2e }}',
					'${{ needs.classify.outputs.docs }}',
					'${{ needs.classify.outputs.react }}',
				].find((candidateValue) => candidateValue !== value);
				assert.ok(
					replacementValue,
					`classifier input ${key} needs a swap target`,
				);
				const mutationLine = line.replace(
					`"${key}":"${value}"`,
					`"${key}":"${replacementValue}"`,
				);
				const mutation = original.replace(line, mutationLine);
				assert.notEqual(
					mutation,
					original,
					`${key} classifier input mutation must change the fixture`,
				);
				await writeFile(workflowFile, mutation);
				const findings = await findCentralCiStructureProblems({ rootDir });
				assert.ok(
					findings.some((finding) =>
						/classifier|output|binding|CI_CLASSIFIER_OUTPUTS/i.test(finding),
					),
					`${key} classifier input should fail: ${findings.join('; ')}`,
				);
			}
		}

		const parentLine = original
			.split('\n')
			.find((line) => line.includes('CI_CENTRAL_RESULTS:'));
		assert.ok(parentLine, 'parent result mapping must be present');
		const parentJson = parentLine.match(/CI_CENTRAL_RESULTS: '([^']+)'/)?.[1];
		assert.ok(parentJson, 'parent result mapping must contain JSON');
		const parentEntries = Object.entries(
			JSON.parse(parentJson) as Record<string, string>,
		);
		for (const [key, value] of parentEntries) {
			const replacementValue = parentEntries.find(
				([candidate]) => candidate !== key,
			)?.[1];
			assert.ok(replacementValue, `parent result ${key} needs a swap target`);
			const mutation = original.replace(
				`"${key}":"${value}"`,
				`"${key}":"${replacementValue}"`,
			);
			assert.notEqual(
				mutation,
				original,
				`${key} parent result mutation must change the fixture`,
			);
			await writeFile(workflowFile, mutation);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) =>
					/parent|central|result|binding/i.test(finding),
				),
				`${key} parent result should fail: ${findings.join('; ')}`,
			);
		}

		const classifierLanes = ['quality', 'front', 'api', 'e2e', 'docs', 'react'];
		for (const lane of classifierLanes) {
			for (const value of ['true', 'false']) {
				const expected = `needs.classify.outputs.${lane} == '${value}'`;
				const replacementLane = classifierLanes.find(
					(candidate) => candidate !== lane,
				);
				assert.ok(replacementLane);
				const mutation = original.replace(
					expected,
					`needs.classify.outputs.${replacementLane} == '${value}'`,
				);
				assert.notEqual(
					mutation,
					original,
					`${lane} ${value} relevance mutation must change the fixture`,
				);
				await writeFile(workflowFile, mutation);
				const findings = await findCentralCiStructureProblems({ rootDir });
				assert.ok(
					findings.some((finding) =>
						/relevance|classifier|consumer|consume|binding|needs\.classify/i.test(
							finding,
						),
					),
					`${lane} ${value} classifier edge should fail: ${findings.join('; ')}`,
				);
			}
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central workflow rejects deletion of every one of its 92 classifier conditions', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-ci-condition-delete-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const workflowFile = path.join(rootDir, '.github/workflows/ci.yml');
	const original = await readFile(workflowFile, 'utf8');
	const workflow = parse(original) as {
		jobs: Record<string, { steps?: Array<Record<string, unknown>> }>;
	};
	const classifierTrueSteps = Object.entries(workflow.jobs).flatMap(
		([jobId, job]) =>
			(job.steps ?? [])
				.filter(
					(step) =>
						typeof step.if === 'string' &&
						/needs\.classify\.outputs\.\w+ == 'true'/.test(step.if),
				)
				.map((step) => ({ jobId, stepId: String(step.id) })),
	);
	assert.equal(classifierTrueSteps.length, 92);

	try {
		let rejected = 0;
		for (const { jobId, stepId } of classifierTrueSteps) {
			const mutation = removeStepIf(original, stepId);
			assert.notEqual(
				mutation,
				original,
				`${jobId}/${stepId} mutation must change the fixture`,
			);
			await writeFile(workflowFile, mutation);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) =>
					/condition|classifier|edge|binding/i.test(finding),
				),
				`${jobId}/${stepId} condition deletion should fail: ${findings.join('; ')}`,
			);
			rejected += 1;
		}
		assert.equal(rejected, 92);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central workflow rejects deletion of each exact E2E classifier condition', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-e2e-condition-delete-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const workflowFile = path.join(rootDir, '.github/workflows/ci.yml');
	const original = await readFile(workflowFile, 'utf8');

	try {
		let rejected = 0;
		for (const [jobId, stepId] of e2eConditionDeletionCases) {
			const mutation = removeStepIf(original, stepId);
			assert.notEqual(
				mutation,
				original,
				`${jobId}/${stepId} mutation must change the fixture`,
			);
			await writeFile(workflowFile, mutation);
			const findings = await findCentralCiStructureProblems({ rootDir });
			assert.ok(
				findings.some((finding) =>
					/condition|classifier|edge|binding/i.test(finding),
				),
				`${jobId}/${stepId} condition deletion should fail: ${findings.join('; ')}`,
			);
			rejected += 1;
		}
		assert.equal(rejected, 11);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('central workflow rejects scalar and list extra matrix axes on both matrix jobs', async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-ci-matrix-'));
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	const workflowFile = path.join(rootDir, '.github/workflows/ci.yml');
	const original = await readFile(workflowFile, 'utf8');
	try {
		for (const jobId of ['front-vitest', 'e2e-test']) {
			const start = original.indexOf(`  ${jobId}:\n`);
			assert.notEqual(start, -1, `${jobId} fixture job missing`);
			let end = original.indexOf('\n  ', start + 3);
			while (end !== -1 && original[end + 3] === ' ') {
				end = original.indexOf('\n  ', end + 1);
			}
			const block = original.slice(start, end === -1 ? original.length : end);
			for (const axis of [
				'os: [ubuntu-latest, macos-latest]',
				'os: ubuntu-latest',
			]) {
				await writeFile(
					workflowFile,
					`${original.slice(0, start)}${block.replace(
						'matrix:\n        shard:',
						`matrix:\n        ${axis}\n        shard:`,
					)}${original.slice(end === -1 ? original.length : end)}`,
				);
				const findings = await findCentralCiStructureProblems({ rootDir });
				assert.ok(
					findings.some((finding) => /matrix|axis|exact/i.test(finding)),
					`${jobId} ${axis} should fail: ${findings.join('; ')}`,
				);
			}
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
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
					'        classify,\n        verification,',
					'        verification,\n        verification,',
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

type JustRecipeDump = {
	body?: unknown[];
	dependencies?: Array<{ recipe?: string }>;
	parameters?: Array<{ default?: unknown }>;
};

type ManifestEvidence = { mirror: string | null; reason: string };

const normalizeManifestCommand = (value: string): string =>
	value.replace(/\s+/g, ' ').trim().replace(/^@/, '');

const flattenJustNode = (node: unknown): string => {
	if (typeof node === 'string') {
		return node;
	}
	if (Array.isArray(node)) {
		return node.map(flattenJustNode).join('');
	}
	return '';
};

const executableWorkflowLines = (run: string): string[] =>
	run
		.split('\n')
		.map(normalizeManifestCommand)
		.filter(
			(line) =>
				line.length > 0 &&
				!line.startsWith('#') &&
				!/^set -e/.test(line) &&
				!['then', 'else', 'fi', 'done', 'esac', ';;', 'do'].includes(line),
		);

const buildExpandedJustCommands = (
	dump: Record<string, JustRecipeDump>,
): Map<string, Set<string>> => {
	const commands = new Map<string, Set<string>>();
	const addCommand = (command: string, recipeName: string): void => {
		const recipes = commands.get(command) ?? new Set<string>();
		recipes.add(recipeName);
		commands.set(command, recipes);
	};
	const canInvokeWithoutArguments = (recipe: JustRecipeDump): boolean =>
		(recipe.parameters ?? []).every(
			(parameter) =>
				parameter.default !== undefined && parameter.default !== null,
		);
	const visited = new Set<string>();
	const visit = (recipeName: string): void => {
		if (visited.has(recipeName)) {
			return;
		}
		visited.add(recipeName);
		const recipe = dump[recipeName];
		if (recipe === undefined) {
			return;
		}
		if (canInvokeWithoutArguments(recipe)) {
			addCommand(`just ${recipeName}`, recipeName);
			addCommand(`pnpm exec just ${recipeName}`, recipeName);
		}
		for (const dependency of recipe.dependencies ?? []) {
			if (typeof dependency.recipe === 'string') {
				visit(dependency.recipe);
			}
		}
		for (const bodyLine of recipe.body ?? []) {
			const command = normalizeManifestCommand(flattenJustNode(bodyLine));
			if (command.length === 0 || command.startsWith('#')) {
				continue;
			}
			addCommand(command, recipeName);
		}
	};
	visit('ci');
	visit('ci-full');
	return commands;
};

test('just manifest evidence recognizes reachable recipe invocations without claiming unreachable recipes', async () => {
	const justDump = JSON.parse(
		execFileSync('just', ['--dump', '--dump-format', 'json'], {
			cwd: repoRoot,
			encoding: 'utf8',
		}),
	) as { recipes: Record<string, JustRecipeDump> };
	const commands = buildExpandedJustCommands(justDump.recipes);

	assert.equal(selectLocalRecipe(['just test-api'], commands), 'test-api');
	assert.equal(
		selectLocalRecipe(['pnpm exec just test-analyzers'], commands),
		'test-analyzers',
	);
	assert.equal(selectLocalRecipe(['just check'], commands), null);
});

const selectLocalRecipe = (
	lines: string[],
	commands: Map<string, Set<string>>,
): string | null => {
	if (lines.length === 0) {
		return null;
	}
	let candidates: Set<string> | undefined;
	for (const line of lines) {
		const matching = commands.get(line);
		if (matching === undefined) {
			return null;
		}
		if (candidates === undefined) {
			candidates = new Set(matching);
			continue;
		}
		candidates = new Set(
			[...candidates].filter((recipe) => matching.has(recipe)),
		);
	}
	if (candidates === undefined || candidates.size === 0) {
		return null;
	}
	return (
		[...candidates].sort((left, right) => {
			const leftCi = left.startsWith('ci-') ? 0 : 1;
			const rightCi = right.startsWith('ci-') ? 0 : 1;
			return (
				leftCi - rightCi ||
				left.length - right.length ||
				left.localeCompare(right)
			);
		})[0] ?? null
	);
};

const deriveManifestEvidence = (
	jobId: string,
	step: Record<string, unknown>,
	commands: Map<string, Set<string>>,
): ManifestEvidence => {
	const name = String(step.name ?? '<unnamed step>');
	if (typeof step.uses === 'string') {
		return {
			mirror: null,
			reason: `Hosted-only action step "${name}" uses ${step.uses}; exact hosted fields: ${JSON.stringify({ if: step.if ?? null, with: step.with ?? null, env: step.env ?? null })}.`,
		};
	}
	const run = typeof step.run === 'string' ? step.run : '';
	const lines = executableWorkflowLines(run);
	const recipe = selectLocalRecipe(lines, commands);
	if (recipe !== null) {
		return {
			mirror: `just ${recipe}`,
			reason: `Local mirror just ${recipe} is derived from exact normalized workflow command match(es): ${JSON.stringify(lines)}.`,
		};
	}
	return {
		mirror: null,
		reason: `No exact local command match for run step "${name}"; normalized workflow command(s): ${JSON.stringify(lines)}. The recursive just call graph was checked without inferring a broader local boundary.`,
	};
};

test('central manifest derives honest evidence for every one of its 169 entries', async () => {
	const manifest = JSON.parse(
		await readFile(
			path.join(repoRoot, 'packages/scripts-ts/src/ci-gate-manifest.json'),
			'utf8',
		),
	) as { steps: Record<string, { mirror: string | null; reason: string }> };
	const workflow = parse(await readFile(workflowPath, 'utf8')) as {
		jobs: Record<string, { steps?: Array<Record<string, unknown>> }>;
	};
	const central = Object.entries(manifest.steps).filter(([id]) =>
		id.startsWith('ci.yml::'),
	);
	assert.equal(central.length, 169);
	const justDump = JSON.parse(
		execFileSync('just', ['--dump', '--dump-format', 'json'], {
			cwd: repoRoot,
			encoding: 'utf8',
		}),
	) as { recipes: Record<string, JustRecipeDump> };
	const commands = buildExpandedJustCommands(justDump.recipes);
	const decisions = new Set<string>();
	for (const [id, entry] of central) {
		const parts = id.split('::');
		const jobId = parts[1];
		const stepName = parts.slice(2).join('::');
		assert.ok(jobId !== undefined && stepName.length > 0, `${id} shape`);
		const step = workflow.jobs[jobId!]?.steps?.find(
			(candidate) => candidate.name === stepName,
		);
		assert.ok(step !== undefined, `${id} must bind to a parsed workflow step`);
		const evidence = deriveManifestEvidence(jobId!, step!, commands);
		decisions.add(id);
		assert.deepEqual(
			{ mirror: entry.mirror, reason: entry.reason },
			evidence,
			`${id} evidence must be derived from its exact step kind and command graph`,
		);
	}
	assert.equal(decisions.size, 169);
	assert.equal(
		manifest.steps['ci.yml::verification::Install pnpm']?.mirror,
		null,
	);
	assert.equal(
		manifest.steps['ci.yml::verification::Install workspace dependencies']
			?.mirror,
		'just ci-install',
	);
	assert.equal(
		manifest.steps['ci.yml::verification::Smoke front production server']
			?.mirror,
		null,
	);
	assert.match(
		manifest.steps['ci.yml::verification::Materialize .env.development']
			?.reason ?? '',
		/No exact local command match/,
	);
});

test('central manifest evidence mutations are RED for all Sol examples and generic hosted reasons', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-central-manifest-'),
	);
	await cp(path.join(repoRoot, '.github'), path.join(rootDir, '.github'), {
		recursive: true,
	});
	await cp(
		path.join(repoRoot, 'packages/scripts-ts/src/ci-gate-manifest.json'),
		path.join(rootDir, 'ci-gate-manifest.json'),
	);
	const manifestPath = path.join(rootDir, 'ci-gate-manifest.json');
	const original = JSON.parse(await readFile(manifestPath, 'utf8')) as {
		steps: Record<string, { mirror: string | null; reason: string }>;
	};
	const workflow = parse(
		await readFile(path.join(rootDir, '.github/workflows/ci.yml'), 'utf8'),
	) as { jobs: Record<string, { steps?: Array<Record<string, unknown>> }> };
	const justDump = JSON.parse(
		execFileSync('just', ['--dump', '--dump-format', 'json'], {
			cwd: repoRoot,
			encoding: 'utf8',
		}),
	) as { recipes: Record<string, JustRecipeDump> };
	const commands = buildExpandedJustCommands(justDump.recipes);
	const mutations: Array<
		[string, string, (entry: { mirror: string | null; reason: string }) => void]
	> = [
		[
			'Install pnpm falsely claims a local mirror',
			'ci.yml::verification::Install pnpm',
			(entry) => {
				entry.mirror = 'just ci-install';
			},
		],
		[
			'workspace dependencies falsely claim hosted-only',
			'ci.yml::verification::Install workspace dependencies',
			(entry) => {
				entry.mirror = null;
			},
		],
		[
			'smoke production server falsely claims ci-front',
			'ci.yml::verification::Smoke front production server',
			(entry) => {
				entry.mirror = 'just ci-front';
			},
		],
		[
			'Materialize env uses an unrelated generic boundary',
			'ci.yml::verification::Materialize .env.development',
			(entry) => {
				entry.reason = 'GitHub-only setup for a hosted runner boundary.';
			},
		],
		[
			'generic action reason omits actual hosted fields',
			'ci.yml::verification::Setup Node',
			(entry) => {
				entry.reason = 'GitHub-only setup for a hosted runner boundary.';
			},
		],
	];
	try {
		for (const [label, id, mutate] of mutations) {
			const mutated = structuredClone(original);
			const entry = mutated.steps[id];
			assert.ok(entry, `${id} fixture entry must exist`);
			mutate(entry);
			await writeFile(manifestPath, JSON.stringify(mutated, null, '\t'));
			const [, jobId, ...nameParts] = id.split('::');
			const stepName = nameParts.join('::');
			const step = workflow.jobs[jobId!]?.steps?.find(
				(candidate) => candidate.name === stepName,
			);
			assert.ok(step, `${id} fixture step must exist`);
			const expected = deriveManifestEvidence(jobId!, step!, commands);
			assert.notDeepEqual(
				{ mirror: entry.mirror, reason: entry.reason },
				expected,
				`${label} must be rejected by the all-entry derivation`,
			);
		}
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});
