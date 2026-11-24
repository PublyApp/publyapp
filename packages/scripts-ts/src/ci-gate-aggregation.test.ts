import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

import {
	EXPECTED_UPSTREAM_JOB_KEYS,
	aggregateCiGate,
	validateCiLaneResult,
} from './check-ci-gate-aggregation.ts';
import { createCiLaneResult } from './ci-lane-result.ts';

// Proves the central gate's artifact aggregation fails closed: all 23 expected
// lane artifacts must exist, carry the exact run identity and step set, match
// classifier relevance, and report successful required work. It also checks
// that ci.yml invokes this aggregator from the sole final-gate topology.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const workflowsDirectory = path.join(repoRoot, '.github/workflows');

test('requires the exact 26 upstream artifact keys', () => {
	assert.equal(EXPECTED_UPSTREAM_JOB_KEYS.length, 26);
	assert.deepEqual(EXPECTED_UPSTREAM_JOB_KEYS, [
		'classify',
		'quality-js',
		'quality-dotnet',
		'guards',
		'docs-react',
		'front-build',
		'front-quality',
		'audit-development',
		'audit-production',
		'api/1',
		'api/2',
		'api/3',
		'api/4',
		'front-vitest/1',
		'front-vitest/2',
		'front-vitest/3',
		'front-vitest/4',
		'e2e-build',
		'e2e-smoke',
		'e2e-test/1',
		'e2e-test/2',
		'e2e-test/3',
		'e2e-test/4',
		'e2e-test/5',
		'e2e-test/6',
		'e2e-cleanup',
	]);
});

test('fails closed when a result artifact is missing or has incomplete step evidence', () => {
	const result = aggregateCiGate({
		run_id: 42,
		run_attempt: 1,
		classifier: { result: 'success', outputs: { quality: 'true' } },
		records: [],
	});

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some((failure) => /missing|exactly 22/i.test(failure)),
	);
});

test('ci-lane-result records preserve the run identity and exact step set', () => {
	const result = createCiLaneResult({
		jobKey: 'front-vitest/2',
		lane: 'front',
		expectedSteps: [
			'front-vitest.checkout',
			'front-vitest.install',
			'front-vitest.vitest',
			'front-vitest.not-applicable',
		],
		mode: 'relevant',
		runId: 123,
		runAttempt: 2,
		eventSha: 'event-sha',
		stepResults: {
			'front-vitest.checkout': { outcome: 'success' },
			'front-vitest.install': { outcome: 'success' },
			'front-vitest.vitest': { outcome: 'failure', exit_code: 17 },
			'front-vitest.not-applicable': { outcome: 'skipped' },
		},
	});

	assert.equal(result.run_id, 123);
	assert.equal(result.run_attempt, 2);
	assert.deepEqual(result.job.lanes.front.expected_steps, [
		'front-vitest.checkout',
		'front-vitest.install',
		'front-vitest.vitest',
		'front-vitest.not-applicable',
	]);
	assert.equal(result.job.lanes.front.steps[2].outcome, 'failure');
	assert.equal(result.job.conclusion, 'failure');
});

test('rejects a lane artifact with an extra lane or a classifier-mismatched mode', () => {
	const result = aggregateCiGate({
		run_id: 42,
		run_attempt: 1,
		classifier: {
			result: 'success',
			outputs: {
				quality: 'false',
				front: 'false',
				api: 'false',
				e2e: 'false',
				docs: 'false',
				react: 'false',
			},
		},
		records: [
			{
				schema_version: 1,
				run_id: 42,
				run_attempt: 1,
				event_sha: 'sha',
				job: {
					key: 'audit-development',
					id: 'audit-development',
					lanes: {
						audit: {
							mode: 'relevant',
							expected_steps: [
								'audit-development.audit',
								'audit-development.not-applicable',
							],
							steps: [
								{
									id: 'audit-development.audit',
									execution: 'executed',
									outcome: 'success',
								},
								{
									id: 'audit-development.not-applicable',
									execution: 'skipped',
									outcome: 'skipped',
								},
							],
						},
						unexpected: {
							mode: 'relevant',
							expected_steps: [],
							steps: [],
						},
					},
				},
			},
		],
	});

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some((failure) =>
			/unknown lane|not applicable|sentinel/i.test(failure),
		),
	);
});

test('rejects a skipped central parent even when its artifact is otherwise valid', () => {
	const result = aggregateCiGate({
		run_id: 42,
		run_attempt: 1,
		classifier: {
			result: 'success',
			outputs: {
				quality: 'false',
				front: 'false',
				api: 'false',
				e2e: 'false',
				docs: 'false',
				react: 'false',
			},
		},
		records: [],
		central_results: { verification: 'skipped' },
	});

	assert.equal(result.ok, false);
	assert.ok(
		result.failures.some((failure) => /central parent|skipped/i.test(failure)),
	);
});

test('fails closed on a malformed primitive step record', () => {
	const failures: string[] = [];
	const record = {
		schema_version: 1,
		run_id: 42,
		run_attempt: 1,
		event_sha: 'sha',
		job: {
			key: 'front-vitest/1',
			id: 'front-vitest',
			matrix: { shard: 1 },
			lanes: { front: { expected_steps: ['step'], steps: ['bad'] } },
		},
	};

	assert.equal(validateCiLaneResult(record, 42, 1, failures), false);
	assert.ok(failures.some((failure) => /malformed/i.test(failure)));
});

const e2eBuildExpectedSteps = [
	'e2e-build.checkout',
	'e2e-build.plan_install_pnpm',
	'e2e-build.plan_setup_node',
	'e2e-build.plan_install_deps',
	'e2e-build.plan',
	'e2e-build.plan_upload',
	'e2e-build.image_tag',
	'e2e-build.image_root',
	'e2e-build.image_fork',
	'e2e-build.setup_buildx',
	'e2e-build.setup_runtime',
	'e2e-build.login',
	'e2e-build.image_reuse',
	'e2e-build.images',
	'e2e-build.runtime_guard',
	'e2e-build.upload_images',
	'e2e-build.not-applicable',
];

const skippedPlanStepIds = new Set([
	'e2e-build.plan_install_deps',
	'e2e-build.plan',
	'e2e-build.plan_upload',
]);

/**
 * Reproduces the failing CI shape: on a non-merge-queue event ci.yml skips the
 * three shard-plan steps, so the lane reports them `skipped`. The transport
 * profile keeps `login` executed and `upload_images` skipped.
 */
const aggregateSkippedPlanE2eBuild = (eventName: string | undefined) => {
	const record = createCiLaneResult({
		jobKey: 'e2e-build',
		lane: 'e2e',
		expectedSteps: e2eBuildExpectedSteps,
		mode: 'relevant',
		runId: 42,
		runAttempt: 1,
		eventSha: 'sha',
		workflowEvent: eventName,
		stepResults: Object.fromEntries(
			e2eBuildExpectedSteps.map((id) => [
				id,
				{
					outcome:
						skippedPlanStepIds.has(id) || id === 'e2e-build.upload_images'
							? 'skipped'
							: 'success',
				},
			]),
		),
	});
	return aggregateCiGate({
		run_id: 42,
		run_attempt: 1,
		event_name: eventName,
		classifier: {
			result: 'success',
			outputs: {
				quality: 'false',
				front: 'false',
				api: 'false',
				e2e: 'true',
				docs: 'false',
				react: 'false',
			},
		},
		records: [record],
	});
};

const planStepFailures = (failures: string[]): string[] =>
	failures.filter((failure) =>
		/e2e-build\/e2e: relevant step e2e-build\.(plan|plan_install_deps|plan_upload) did not succeed/.test(
			failure,
		),
	);

// The plan steps are gated to merge_group, so a pull_request lane that reports
// them skipped must not fail the final aggregator (the red run 45473993639).
test('accepts skipped shard-plan steps on a pull_request e2e-build lane', () => {
	const result = aggregateSkippedPlanE2eBuild('pull_request');

	assert.equal(result.ok, false); // the other 25 artifacts are absent here
	assert.deepEqual(planStepFailures(result.failures), []);
});

test('requires executed shard-plan steps on a merge_group e2e-build lane', () => {
	const result = aggregateSkippedPlanE2eBuild('merge_group');

	assert.deepEqual(planStepFailures(result.failures).sort(), [
		'e2e-build/e2e: relevant step e2e-build.plan did not succeed',
		'e2e-build/e2e: relevant step e2e-build.plan_install_deps did not succeed',
		'e2e-build/e2e: relevant step e2e-build.plan_upload did not succeed',
	]);
});

test('fails closed on a missing or empty event with skipped shard-plan steps', () => {
	for (const eventName of [undefined, '']) {
		const result = aggregateSkippedPlanE2eBuild(eventName);
		assert.equal(
			planStepFailures(result.failures).length,
			3,
			String(eventName),
		);
	}
});

test('the central gate invokes the aggregation script and has the only gate topology', () => {
	const document = parse(
		readFileSync(path.join(workflowsDirectory, 'ci.yml'), 'utf8'),
	);
	const gateSteps = document?.jobs?.gate?.steps ?? [];
	const aggregationSteps = gateSteps.filter(
		(step) =>
			typeof step?.run === 'string' &&
			step.run.includes('check-ci-gate-aggregation.ts'),
	);
	assert.equal(aggregationSteps.length, 1);
	assert.equal(typeof aggregationSteps[0].env?.CI_CENTRAL_RESULTS, 'string');
});
