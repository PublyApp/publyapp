import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
	aggregateCiGate,
	validateCiLaneResult,
} from './check-ci-gate-aggregation.ts';
import { createCiLaneResult } from './ci-lane-result.ts';
import { NON_VITEST_COMMANDS } from './ci-non-vitest-manifest.ts';

const context = {
	runId: 42,
	runAttempt: 3,
	eventSha: 'event-sha',
	eventName: 'pull_request',
	workflowPath: '.github/workflows/ci.yml',
	workflowId: 'central ci',
	workflowEvent: 'pull_request',
};

type MutableObject = Record<string, unknown>;

const mutableObject = (value: unknown): MutableObject => {
	assert.equal(typeof value, 'object');
	assert.notEqual(value, null);
	return value as MutableObject;
};

const makeRecord = () =>
	createCiLaneResult({
		jobKey: 'api',
		lane: 'api',
		expectedSteps: ['api.checkout', 'api.suite', 'api.not-applicable'],
		mode: 'relevant',
		runId: context.runId,
		runAttempt: context.runAttempt,
		eventSha: context.eventSha,
		workflowPath: context.workflowPath,
		workflowId: context.workflowId,
		workflowEvent: context.workflowEvent,
		stepResults: {
			'api.checkout': { outcome: 'success' },
			'api.suite': { outcome: 'success' },
			'api.not-applicable': { outcome: 'skipped' },
		},
	});

const assertRejected = (mutate: (record: unknown) => void, message: RegExp) => {
	const record = makeRecord();
	mutate(record);
	const failures: string[] = [];

	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), message);
};

test('accepts the closed lane-result envelope and derived artifact identity', () => {
	const failures: string[] = [];
	const record = makeRecord();

	assert.equal(validateCiLaneResult(record, context, failures), true);
	assert.deepEqual(
		{
			name: record.artifact_name,
			filename: record.artifact_filename,
			key: record.job.key,
		},
		{
			name: 'ci-lane-result-42-3-api',
			filename: 'api.json',
			key: 'api',
		},
	);
});

test.each([
	[
		'wrong event SHA',
		(record: unknown) => (mutableObject(record).event_sha = 'old-sha'),
		/event_sha/,
	],
	[
		'wrong workflow path',
		(record: unknown) => (mutableObject(record).workflow_path = 'old.yml'),
		/workflow path/,
	],
	[
		'wrong workflow identity',
		(record: unknown) => (mutableObject(record).workflow_id = 'other'),
		/workflow id/,
	],
	[
		'wrong event',
		(record: unknown) => (mutableObject(record).workflow_event = 'push'),
		/workflow event/,
	],
	[
		'renamed artifact',
		(record: unknown) =>
			(mutableObject(record).artifact_filename = 'renamed.json'),
		/artifact filename/,
	],
	[
		'wrong artifact owner',
		(record: unknown) =>
			(mutableObject(record).artifact_name = 'ci-lane-result-42-3-other'),
		/artifact name/,
	],
	[
		'unknown top-level field',
		(record: unknown) => (mutableObject(record).extra = true),
		/unknown field/,
	],
	[
		'nested report on non-verification job',
		(record: unknown) => (mutableObject(mutableObject(record).job).report = {}),
		/only allowed on verification/,
	],
	[
		'unknown lane mode',
		(record: unknown) =>
			((
				mutableObject(mutableObject(mutableObject(record).job).lanes)
					.api as MutableObject
			).mode = 'maybe'),
		/malformed lane mode/,
	],
	[
		'reordered step evidence',
		(record: unknown) => {
			const lanes = mutableObject(mutableObject(record).job)
				.lanes as MutableObject;
			const api = mutableObject(lanes.api);
			api.steps = [...(api.steps as unknown[])].reverse();
		},
		/step order/,
	],
])(
	'%s is rejected by the strict lane-result contract',
	(_name, mutate, message) => {
		assertRejected(mutate, message);
	},
);

test('omitted front nested report is rejected when the front lane is relevant', () => {
	const record = createCiLaneResult({
		jobKey: 'verification',
		lane: 'front',
		expectedSteps: ['verification.front', 'verification.front.not-applicable'],
		mode: 'relevant',
		runId: context.runId,
		runAttempt: context.runAttempt,
		eventSha: context.eventSha,
		workflowPath: context.workflowPath,
		workflowId: context.workflowId,
		workflowEvent: context.workflowEvent,
		stepResults: {
			'verification.front': { outcome: 'success' },
			'verification.front.not-applicable': { outcome: 'skipped' },
		},
	});
	const failures: string[] = [];

	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), /front.*report|nested report/i);
});

test('irrelevant front lane rejects an unexpected nested report', () => {
	const record = createCiLaneResult({
		jobKey: 'verification',
		lane: 'front',
		expectedSteps: ['verification.front', 'verification.front.not-applicable'],
		mode: 'not_applicable',
		runId: context.runId,
		runAttempt: context.runAttempt,
		eventSha: context.eventSha,
		workflowPath: context.workflowPath,
		workflowId: context.workflowId,
		workflowEvent: context.workflowEvent,
		stepResults: {
			'verification.front': { outcome: 'skipped' },
			'verification.front.not-applicable': { outcome: 'success' },
		},
		report: {},
	});
	const failures: string[] = [];

	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), /irrelevant.*nested report/i);
});

test('front nested report requires the exact ordered non-Vitest command ABI', () => {
	const record = createCiLaneResult({
		jobKey: 'verification',
		lane: 'front',
		expectedSteps: ['verification.front', 'verification.front.not-applicable'],
		mode: 'relevant',
		runId: context.runId,
		runAttempt: context.runAttempt,
		eventSha: context.eventSha,
		workflowPath: context.workflowPath,
		workflowId: context.workflowId,
		workflowEvent: context.workflowEvent,
		stepResults: {
			'verification.front': { outcome: 'success' },
			'verification.front.not-applicable': { outcome: 'skipped' },
		},
		report: {
			front: {
				non_vitest: {
					commands: NON_VITEST_COMMANDS.map(({ id, argv }) => ({
						id,
						argv,
						execution: 'executed',
						outcome: 'success',
					})),
					ok: true,
				},
			},
		},
	});
	let failures: string[] = [];
	assert.equal(validateCiLaneResult(record, context, failures), true);

	const report = mutableObject(mutableObject(record).job).report;
	const nonVitest = mutableObject(mutableObject(report).front).non_vitest;
	const commands = mutableObject(nonVitest).commands as MutableObject[];
	commands[0].argv = ['pnpm', 'check:guard-coverage', '--mutated'];
	failures = [];
	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), /argv differs/);
});

test('aggregation rejects duplicate upstream records and duplicate artifact filenames', () => {
	const record = makeRecord();
	const aggregate = aggregateCiGate({
		run_id: context.runId,
		run_attempt: context.runAttempt,
		event_sha: context.eventSha,
		event_name: context.eventName,
		workflow_path: context.workflowPath,
		workflow_id: context.workflowId,
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
		records: [record, record],
		artifact_filenames: ['api.json', 'api.json'],
	});

	assert.equal(aggregate.ok, false);
	assert.match(aggregate.failures.join('\n'), /duplicate/);
	assert.match(aggregate.failures.join('\n'), /artifact filename set/);
});
