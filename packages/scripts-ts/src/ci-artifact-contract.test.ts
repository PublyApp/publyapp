import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import {
	EXPECTED_UPSTREAM_JOB_KEYS,
	FRONT_REPORT_JOB_ID,
	aggregateCiGate,
	getExpectedJobLanes,
	readRecords,
	selectLatestAttemptArtifacts,
	validateCiLaneResult,
} from './check-ci-gate-aggregation.ts';
import type { AggregateInput } from './check-ci-gate-aggregation.ts';
import { createCiLaneResult } from './ci-lane-result.ts';
import { NON_VITEST_COMMANDS } from './ci-non-vitest-manifest.ts';
import type { JsonValue } from './json-value.ts';

const context = {
	runId: 42,
	runAttempt: 3,
	eventSha: 'event-sha',
	eventName: 'pull_request',
	workflowPath: '.github/workflows/ci.yml',
	workflowRef: 'PublyApp/publyapp/.github/workflows/ci.yml@refs/pull/42/merge',
	workflowEvent: 'pull_request',
};

type MutableObject = Record<string, JsonValue>;

const mutableObject = (value: JsonValue): MutableObject => {
	assert.equal(typeof value, 'object');
	assert.notEqual(value, null);
	return value as MutableObject;
};

const completeStepOutcome = (step: string): 'success' | 'skipped' => {
	if (
		step.endsWith('.not-applicable') ||
		step === 'e2e-build.upload_images' ||
		step === 'e2e-test.download_images' ||
		step === 'e2e-test.load_images' ||
		step === 'e2e-smoke.download_images' ||
		step === 'e2e-smoke.load_images'
	) {
		return 'skipped';
	}
	return 'success';
};

const makeRecord = () =>
	createCiLaneResult({
		jobKey: 'api/1',
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

const makeCompleteRecords = (runAttempt: number = context.runAttempt) =>
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
				runAttempt,
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
					jobKey === FRONT_REPORT_JOB_ID && lane.lane === 'front'
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
		if (jobKey === FRONT_REPORT_JOB_ID) {
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
				'quality-js',
				'quality-dotnet',
				'guards',
				'docs-react',
				'front-build',
				'front-quality',
				'audit-development',
				'audit-production',
				'api',
				'front-vitest',
				'e2e-build',
				'e2e-smoke',
				'e2e-test',
				'e2e-cleanup',
			].map((job) => [job, 'success']),
		),
	};
};

const assertRejected = (
	mutate: (record: MutableObject) => void,
	message: RegExp,
) => {
	const record = mutableObject(makeRecord());
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
			name: 'ci-lane-result-42-3-api-1',
			filename: 'api-1.json',
			key: 'api/1',
		},
	);
});

test.each([
	[
		'wrong event SHA',
		(record: MutableObject) => (record.event_sha = 'old-sha'),
		/event_sha/,
	],
	[
		'wrong workflow path',
		(record: MutableObject) => (record.workflow_path = 'old.yml'),
		/workflow path/,
	],
	[
		'wrong workflow identity',
		(record: MutableObject) => (record.workflow_ref = 'other'),
		/workflow ref/,
	],
	[
		'wrong event',
		(record: MutableObject) => (record.workflow_event = 'push'),
		/workflow event/,
	],
	[
		'renamed artifact',
		(record: MutableObject) => (record.artifact_filename = 'renamed.json'),
		/artifact filename/,
	],
	[
		'wrong artifact owner',
		(record: MutableObject) =>
			(record.artifact_name = 'ci-lane-result-42-3-other'),
		/artifact name/,
	],
	[
		'unknown top-level field',
		(record: MutableObject) => (record.extra = true),
		/unknown field/,
	],
	[
		'nested report on a job without the report lane',
		(record: MutableObject) => (mutableObject(record.job).report = {}),
		/only allowed on front-build/,
	],
	[
		'unknown lane mode',
		(record: MutableObject) => {
			const api = mutableObject(
				mutableObject(mutableObject(record.job).lanes).api,
			);
			api.mode = 'maybe';
		},
		/malformed lane mode/,
	],
	[
		'reordered step evidence',
		(record: MutableObject) => {
			const lanes = mutableObject(mutableObject(record.job).lanes);
			const api = mutableObject(lanes.api);
			api.steps = [...(api.steps as JsonValue[])].reverse();
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
		jobKey: FRONT_REPORT_JOB_ID,
		lane: 'front',
		expectedSteps: [
			`${FRONT_REPORT_JOB_ID}.front`,
			`${FRONT_REPORT_JOB_ID}.front.not-applicable`,
		],
		mode: 'relevant',
		runId: context.runId,
		runAttempt: context.runAttempt,
		eventSha: context.eventSha,
		workflowPath: context.workflowPath,
		workflowRef: context.workflowRef,
		workflowEvent: context.workflowEvent,
		stepResults: {
			[`${FRONT_REPORT_JOB_ID}.front`]: { outcome: 'success' },
			[`${FRONT_REPORT_JOB_ID}.front.not-applicable`]: { outcome: 'skipped' },
		},
	});
	const failures: string[] = [];

	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), /front.*report|nested report/i);
});

test('irrelevant front lane rejects an unexpected nested report', () => {
	const record = createCiLaneResult({
		jobKey: FRONT_REPORT_JOB_ID,
		lane: 'front',
		expectedSteps: [
			`${FRONT_REPORT_JOB_ID}.front`,
			`${FRONT_REPORT_JOB_ID}.front.not-applicable`,
		],
		mode: 'not_applicable',
		runId: context.runId,
		runAttempt: context.runAttempt,
		eventSha: context.eventSha,
		workflowPath: context.workflowPath,
		workflowRef: context.workflowRef,
		workflowEvent: context.workflowEvent,
		stepResults: {
			[`${FRONT_REPORT_JOB_ID}.front`]: { outcome: 'skipped' },
			[`${FRONT_REPORT_JOB_ID}.front.not-applicable`]: { outcome: 'success' },
		},
		report: {},
	});
	const failures: string[] = [];

	assert.equal(validateCiLaneResult(record, context, failures), false);
	assert.match(failures.join('\n'), /irrelevant.*nested report/i);
});

test('front nested report requires the exact ordered non-Vitest command ABI', () => {
	const record = createCiLaneResult({
		jobKey: FRONT_REPORT_JOB_ID,
		lane: 'front',
		expectedSteps: [
			`${FRONT_REPORT_JOB_ID}.front`,
			`${FRONT_REPORT_JOB_ID}.front.not-applicable`,
		],
		mode: 'relevant',
		runId: context.runId,
		runAttempt: context.runAttempt,
		eventSha: context.eventSha,
		workflowPath: context.workflowPath,
		workflowRef: context.workflowRef,
		workflowEvent: context.workflowEvent,
		stepResults: {
			[`${FRONT_REPORT_JOB_ID}.front`]: { outcome: 'success' },
			[`${FRONT_REPORT_JOB_ID}.front.not-applicable`]: { outcome: 'skipped' },
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

test('aggregation rejects valid api and front-report contents swapped between observed artifacts', () => {
	const input = completeAggregateInput();
	const api = input.records.find((record) => record.job.key === 'api/1');
	const verification = input.records.find(
		(record) => record.job.key === FRONT_REPORT_JOB_ID,
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
		(candidate) => candidate.job.key === FRONT_REPORT_JOB_ID,
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
		(candidate) => candidate.job.key === FRONT_REPORT_JOB_ID,
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

// Partial re-runs (#2159): a "re-run failed jobs" attempt only re-uploads the
// lanes it re-ran, so the gate keeps the highest-attempt artifact per lane.
type LaneRecord = ReturnType<typeof makeCompleteRecords>[number];

const observe = (record: LaneRecord) => ({
	container: record.artifact_name,
	filename: record.artifact_filename,
	file_path: `${record.artifact_name}/${record.artifact_filename}`,
	record,
});

const failLane = (record: LaneRecord): LaneRecord => {
	record.job.conclusion = 'failure';
	for (const lane of Object.values(record.job.lanes)) {
		const step = lane.steps.find(
			(candidate) => candidate.outcome === 'success',
		);
		if (step !== undefined) {
			step.outcome = 'failure';
		}
	}
	return record;
};

const partialRerun = (
	rerunKeys: string[],
	rerunRecord: (record: LaneRecord) => LaneRecord = (record) => record,
) => {
	const input = completeAggregateInput();
	const firstAttempt = makeCompleteRecords(1).map((record) =>
		rerunKeys.includes(record.job.key) ? failLane(record) : record,
	);
	const rerun = makeCompleteRecords(context.runAttempt)
		.filter((record) => rerunKeys.includes(record.job.key))
		.map(rerunRecord);
	const records = [...firstAttempt, ...rerun];
	return {
		...input,
		records,
		artifact_filenames: records.map((record) => record.artifact_filename),
		observed_artifacts: records.map(observe),
	} satisfies AggregateInput;
};

test('partial re-run: lanes from attempt 1 plus a lane re-run in the current attempt pass', () => {
	const result = aggregateCiGate(partialRerun(['front-vitest/2']));

	assert.equal(result.ok, true, result.failures.join('\n'));
	assert.equal(result.observed_keys.length, EXPECTED_UPSTREAM_JOB_KEYS.length);
});

test('partial re-run: several lanes re-run across attempts 2 and 3 keep the highest attempt', () => {
	const input = completeAggregateInput();
	const attempt1 = makeCompleteRecords(1).map((record) =>
		record.job.key === 'api/1' || record.job.key === FRONT_REPORT_JOB_ID
			? failLane(record)
			: record,
	);
	const attempt2 = makeCompleteRecords(2)
		.filter(
			(record) =>
				record.job.key === 'api/1' || record.job.key === FRONT_REPORT_JOB_ID,
		)
		.map((record) => (record.job.key === 'api/1' ? failLane(record) : record));
	const attempt3 = makeCompleteRecords(3).filter(
		(record) => record.job.key === 'api/1',
	);
	const records = [...attempt1, ...attempt2, ...attempt3];

	const result = aggregateCiGate({
		...input,
		records,
		artifact_filenames: records.map((record) => record.artifact_filename),
		observed_artifacts: records.map(observe),
	} satisfies AggregateInput);

	assert.equal(result.ok, true, result.failures.join('\n'));
});

test('partial re-run: a lane failing in its latest attempt fails even though attempt 1 passed it', () => {
	const input = completeAggregateInput();
	const attempt1 = makeCompleteRecords(1);
	const attempt3 = makeCompleteRecords(3)
		.filter((record) => record.job.key === 'front-vitest/2')
		.map(failLane);
	const records = [...attempt1, ...attempt3];

	const result = aggregateCiGate({
		...input,
		records,
		artifact_filenames: records.map((record) => record.artifact_filename),
		observed_artifacts: records.map(observe),
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /front-vitest\/2/);
});

test('partial re-run: an older passing lane that was re-run and failed in the latest attempt fails the gate', () => {
	// The re-run job produced no usable artifact, so only attempt 1 remains for the
	// lane. The central job result for it is the backstop and must still reject.
	const input = completeAggregateInput();
	const records = makeCompleteRecords(1);

	const result = aggregateCiGate({
		...input,
		records,
		artifact_filenames: records.map((record) => record.artifact_filename),
		observed_artifacts: records.map(observe),
		central_results: { ...input.central_results, 'front-vitest': 'failure' },
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /front-vitest.*failure/);
});

test('partial re-run: a lane absent from every attempt is still missing', () => {
	const input = partialRerun(['front-vitest/2']);
	const observed = input.observed_artifacts.filter(
		(observation) => observation.record.job.key !== 'e2e-cleanup',
	);

	const result = aggregateCiGate({
		...input,
		records: observed.map((observation) => observation.record),
		artifact_filenames: observed.map((observation) => observation.filename),
		observed_artifacts: observed,
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /e2e-cleanup|exactly 15/);
});

test('partial re-run: an artifact from a future attempt is rejected, not preferred', () => {
	const input = completeAggregateInput();
	const records = [
		...makeCompleteRecords(1),
		...makeCompleteRecords(context.runAttempt + 1).filter(
			(record) => record.job.key === 'api/1',
		),
	];

	const result = aggregateCiGate({
		...input,
		records,
		artifact_filenames: records.map((record) => record.artifact_filename),
		observed_artifacts: records.map(observe),
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /another run or attempt/);
});

test('partial re-run: an older-attempt artifact still has its contents validated exactly', () => {
	const input = completeAggregateInput();
	const records = makeCompleteRecords(1);
	records[0].event_sha = 'someone-elses-sha';

	const result = aggregateCiGate({
		...input,
		records,
		artifact_filenames: records.map((record) => record.artifact_filename),
		observed_artifacts: records.map(observe),
	} satisfies AggregateInput);

	assert.equal(result.ok, false);
	assert.match(result.failures.join('\n'), /event_sha/);
});

test('selectLatestAttemptArtifacts keeps the highest attempt per lane and foreign containers', () => {
	const make = (container: string) => ({
		container,
		filename: 'api.json',
		file_path: `${container}/api.json`,
		record: {},
	});
	const selected = selectLatestAttemptArtifacts(
		[
			make('ci-lane-result-42-1-api'),
			make('ci-lane-result-42-3-api'),
			make('ci-lane-result-42-2-api'),
			make(`ci-lane-result-42-2-${FRONT_REPORT_JOB_ID}`),
			make('ci-lane-result-41-9-api'),
			make('unrelated-container'),
		],
		42,
	).map((observation) => observation.container);

	assert.deepEqual(selected, [
		'ci-lane-result-42-3-api',
		`ci-lane-result-42-2-${FRONT_REPORT_JOB_ID}`,
		'ci-lane-result-41-9-api',
		'unrelated-container',
	]);
});

test('selectLatestAttemptArtifacts does not parse a leading-zero attempt as valid', () => {
	const make = (container: string) => ({
		container,
		filename: 'api.json',
		file_path: `${container}/api.json`,
		record: {},
	});
	const selected = selectLatestAttemptArtifacts(
		[make('ci-lane-result-42-01-api'), make('ci-lane-result-42-2-api')],
		42,
	).map((observation) => observation.container);

	// The malformed name is retained untouched so strict validation rejects it.
	assert.deepEqual(selected, [
		'ci-lane-result-42-01-api',
		'ci-lane-result-42-2-api',
	]);
});

const writeContainers = (
	directory: string,
	containers: Array<{ record: LaneRecord; raw?: string }>,
) => {
	for (const { record, raw } of containers) {
		const container = path.join(directory, record.artifact_name);
		mkdirSync(container, { recursive: true });
		writeFileSync(
			path.join(container, record.artifact_filename),
			raw ?? JSON.stringify(record),
		);
	}
};

const aggregateFromDirectory = (directory: string) => {
	const input = completeAggregateInput();
	const read = readRecords(directory, context.runId);
	const result = aggregateCiGate({
		...input,
		records: read.records,
		artifact_filenames: read.filenames,
		observed_artifacts: read.observed_artifacts,
	} satisfies AggregateInput);
	return { read, result };
};

test('a corrupt superseded attempt-1 artifact does not fail a lane that attempt 2 re-ran', () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'gate-results-'));
	try {
		const attempt1 = makeCompleteRecords(1);
		const attempt2 = makeCompleteRecords(2).filter(
			(record) => record.job.key === 'front-vitest/2',
		);
		writeContainers(directory, [
			...attempt1.map((record) =>
				record.job.key === 'front-vitest/2'
					? { record, raw: '{ not json' }
					: { record },
			),
			...attempt2.map((record) => ({ record })),
		]);

		const { read, result } = aggregateFromDirectory(directory);

		assert.deepEqual(read.failures, []);
		assert.equal(result.ok, true, result.failures.join('\n'));
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test('a corrupt artifact in the latest attempt still fails the gate', () => {
	const directory = mkdtempSync(path.join(tmpdir(), 'gate-results-'));
	try {
		const attempt1 = makeCompleteRecords(1);
		const attempt2 = makeCompleteRecords(2).filter(
			(record) => record.job.key === 'front-vitest/2',
		);
		writeContainers(directory, [
			...attempt1.map((record) => ({ record })),
			...attempt2.map((record) => ({ record, raw: '{ not json' })),
		]);

		const { read, result } = aggregateFromDirectory(directory);

		assert.match(read.failures.join('\n'), /malformed JSON/);
		assert.equal(result.ok, false);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
