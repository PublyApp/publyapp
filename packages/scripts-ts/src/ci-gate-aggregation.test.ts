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

// Proves the central gate's artifact aggregation fails closed: all 15 expected
// lane artifacts must exist, carry the exact run identity and step set, match
// classifier relevance, and report successful required work. It also checks
// that ci.yml invokes this aggregator from the sole final-gate topology.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const workflowsDirectory = path.join(repoRoot, '.github/workflows');

test('requires the exact 15 upstream artifact keys', () => {
	assert.equal(EXPECTED_UPSTREAM_JOB_KEYS.length, 15);
	assert.deepEqual(EXPECTED_UPSTREAM_JOB_KEYS, [
		'classify',
		'verification',
		'audit-development',
		'audit-production',
		'api',
		'front-vitest/1',
		'front-vitest/2',
		'front-vitest/3',
		'front-vitest/4',
		'e2e-build',
		'e2e-test/1',
		'e2e-test/2',
		'e2e-test/3',
		'e2e-test/4',
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
		result.failures.some((failure) => /missing|exactly 15/i.test(failure)),
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
