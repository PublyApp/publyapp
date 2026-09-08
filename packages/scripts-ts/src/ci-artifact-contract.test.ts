import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
	EXPECTED_UPSTREAM_JOB_KEYS,
	aggregateCiGate,
	getExpectedJobLanes,
	validateCiLaneResult,
} from './check-ci-gate-aggregation.ts';
import type { AggregateInput } from './check-ci-gate-aggregation.ts';
import { createCiLaneResult } from './ci-lane-result.ts';
import { NON_VITEST_COMMANDS } from './ci-non-vitest-manifest.ts';

const context = {
	runId: 42,
	runAttempt: 3,
	eventSha: 'event-sha',
	eventName: 'pull_request',
	workflowPath: '.github/workflows/ci.yml',
	workflowRef: 'PublyApp/publyapp/.github/workflows/ci.yml@refs/pull/42/merge',
	workflowEvent: 'pull_request',
};

type MutableObject = Record<string, unknown>;

const mutableObject = (value: unknown): MutableObject => {
	assert.equal(typeof value, 'object');
	assert.notEqual(value, null);
	return value as MutableObject;
};

const completeStepOutcome = (step: string): 'success' | 'skipped' => {
	if (
		step.endsWith('.not-applicable') ||
		step === 'e2e-build.upload_images' ||
		step === 'e2e-test.download_images' ||
		step === 'e2e-test.load_images'
	) {
		return 'skipped';
	}
	return 'success';
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
		workflowRef: context.workflowRef,
		workflowEvent: context.workflowEvent,
		stepResults: {
			'api.checkout': { outcome: 'success' },
			'api.suite': { outcome: 'success' },
			'api.not-applicable': { outcome: 'skipped' },
		},
	});

const makeCompleteRecords = () =>
	EXPECTED_UPSTREAM_JOB_KEYS.map((jobKey) => {
		const contracts = getExpectedJobLanes(jobKey);
		assert.ok(contracts);
		const makeLane = (lane: (typeof contracts)[number]) =>
			createCiLaneResult({
				jobKey,
				lane: lane.lane,
				expectedSteps: lane.expectedSteps,
				mode: 'relevant',
				runId: context.runId,
				runAttempt: context.runAttempt,
				eventSha: context.eventSha,
				workflowPath: context.workflowPath,
				workflowRef: context.workflowRef,
				workflowEvent: context.workflowEvent,
				stepResults: Object.fromEntries(
					lane.expectedSteps.map((step) => [
						step,
						{ outcome: completeStepOutcome(step) },
					]),
				),
				report:
					jobKey === 'verification' && lane.lane === 'front'
						? {
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
							}
						: undefined,
			});
		const result = makeLane(contracts[0]);
		for (const lane of contracts.slice(1)) {
			result.job.lanes[lane.lane] = makeLane(lane).job.lanes[lane.lane];
		}
		if (jobKey === 'verification') {
			result.job.report = {
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
			};
		}
		return result;
	});

const completeAggregateInput = () => {
	const records = makeCompleteRecords();
	return {
		run_id: context.runId,
		run_attempt: context.runAttempt,
		event_sha: context.eventSha,
		event_name: context.eventName,
		workflow_path: context.workflowPath,
		workflow_ref: context.workflowRef,
		classifier: {
			result: 'success',
			outputs: Object.fromEntries(
				['quality', 'front', 'api', 'e2e', 'docs', 'react'].map((lane) => [
					lane,
					'true',
				]),
			),
		},
		records,
		artifact_filenames: records.map((record) => record.artifact_filename),
		central_results: Object.fromEntries(
			[
				'verification',
				'audit-development',
				'audit-production',
				'api',
				'front-vitest',
				'e2e-build',
				'e2e-test',
				'e2e-cleanup',
			].map((job) => [job, 'success']),
		),
	};
};

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
		(record: unknown) => (mutableObject(record).workflow_ref = 'other'),
		/workflow ref/,
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
		workflowRef: context.workflowRef,
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
		workflowRef: context.workflowRef,
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
		workflowRef: context.workflowRef,
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
		workflow_ref: context.workflowRef,
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

test('aggregation rejects valid api and verification contents swapped between observed artifacts', () => {
	const input = completeAggregateInput();
	const api = input.records.find((record) => record.job.key === 'api');
	const verification = input.records.find(
		(record) => record.job.key === 'verification',
	);
	assert.ok(api);
	assert.ok(verification);
	const observedArtifacts = input.records.map((record) => {
		let observedRecord = record;
		if (record === api) {
			observedRecord = verification;
		} else if (record === verification) {
			observedRecord = api;
		}
		return {
			container: record.artifact_name,
			filename: record.artifact_filename,
			file_path: `${record.artifact_name}/${record.artifact_filename}`,
			record: observedRecord,
		};
	});

	const result = aggregateCiGate({
		...input,
		observed_artifacts: observedArtifacts,
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /observed|container|filename|path/i);
});

const observedArtifactsFor = (
	input: ReturnType<typeof completeAggregateInput>,
) =>
	input.records.map((record) => ({
		container: record.artifact_name,
		filename: record.artifact_filename,
		file_path: `${record.artifact_name}/${record.artifact_filename}`,
		record,
	}));

test('aggregation accepts a complete positive observed-artifact set', () => {
	const input = completeAggregateInput();
	const result = aggregateCiGate({
		...input,
		observed_artifacts: observedArtifactsFor(input),
	} satisfies AggregateInput);

	assert.equal(result.ok, true, result.failures.join('\n'));
});

test('aggregation rejects an e2e-build record with both transports executed', () => {
	const input = completeAggregateInput();
	const record = input.records.find(
		(candidate) => candidate.job.key === 'e2e-build',
	);
	assert.ok(record);
	const lane = record.job.lanes.e2e;
	for (const id of ['e2e-build.login', 'e2e-build.upload_images']) {
		const step = lane.steps.find((candidate) => candidate.id === id);
		assert.ok(step);
		step.execution = 'executed';
		step.outcome = 'success';
	}

	const result = aggregateCiGate({
		...input,
		observed_artifacts: observedArtifactsFor(input),
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /transport (pair|profile)/);
});

test('aggregation rejects an e2e-test record with an invalid transport profile', () => {
	const input = completeAggregateInput();
	const record = input.records.find(
		(candidate) => candidate.job.key === 'e2e-test/1',
	);
	assert.ok(record);
	const lane = record.job.lanes.e2e;
	for (const id of [
		'e2e-test.login',
		'e2e-test.pull_stack',
		'e2e-test.download_images',
		'e2e-test.load_images',
	]) {
		const step = lane.steps.find((candidate) => candidate.id === id);
		assert.ok(step);
		step.execution = 'executed';
		step.outcome = 'success';
	}

	const result = aggregateCiGate({
		...input,
		observed_artifacts: observedArtifactsFor(input),
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /transport profile/);
});

test('aggregation rejects an observed record from the wrong container', () => {
	const input = completeAggregateInput();
	const observedArtifacts = observedArtifactsFor(input);
	observedArtifacts[0].container = 'unrelated-container';
	observedArtifacts[0].file_path = 'unrelated-container/api.json';

	const result = aggregateCiGate({
		...input,
		observed_artifacts: observedArtifacts,
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(
		result.failures.join('\n'),
		/observed.*container|artifact name/i,
	);
});

test('aggregation rejects duplicate observed artifact containers', () => {
	const input = completeAggregateInput();
	const observedArtifacts = observedArtifactsFor(input);
	observedArtifacts[1].container = observedArtifacts[0].container;
	observedArtifacts[1].file_path = `${observedArtifacts[0].container}/${observedArtifacts[1].filename}`;

	const result = aggregateCiGate({
		...input,
		observed_artifacts: observedArtifacts,
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /duplicate.*container/i);
});

test('relevant front report requires non-Vitest ok true even when failed commands explain false', () => {
	const record = makeCompleteRecords().find(
		(candidate) => candidate.job.key === 'verification',
	);
	assert.ok(record);
	const report = mutableObject(record.job).report as MutableObject;
	const nonVitest = mutableObject(mutableObject(report).front).non_vitest;
	mutableObject(nonVitest).ok = false;
	const commands = mutableObject(nonVitest).commands as MutableObject[];
	commands[0].outcome = 'failure';
	const failures: string[] = [];

	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), /ok.*true|non-Vitest.*ok/i);
});

test('nested non-Vitest diagnostics reject invalid optional types', () => {
	const record = makeCompleteRecords().find(
		(candidate) => candidate.job.key === 'verification',
	);
	assert.ok(record);
	const report = mutableObject(record.job).report as MutableObject;
	const nonVitest = mutableObject(mutableObject(report).front).non_vitest;
	const commands = mutableObject(nonVitest).commands as MutableObject[];
	commands[0].exit_code = 'not-an-integer';
	commands[0].signal = 42;
	const failures: string[] = [];

	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), /exit_code|signal/i);
});
