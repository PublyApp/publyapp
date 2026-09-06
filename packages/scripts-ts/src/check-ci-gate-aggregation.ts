import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const CLASSIFIER_LANES = [
	'quality',
	'front',
	'api',
	'e2e',
	'docs',
	'react',
] as const;

export type ClassifierLane = (typeof CLASSIFIER_LANES)[number];

export const EXPECTED_UPSTREAM_JOB_KEYS = [
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
] as const;

export type UpstreamJobKey = (typeof EXPECTED_UPSTREAM_JOB_KEYS)[number];

export type StepEvidence = {
	id: string;
	execution: 'executed' | 'skipped';
	outcome: 'success' | 'failure' | 'cancelled' | 'skipped';
	exit_code?: number;
	signal?: string;
};

export type LaneEvidence = {
	mode: 'relevant' | 'not_applicable';
	expected_steps: string[];
	steps: StepEvidence[];
};

export type CiLaneResult = {
	schema_version: 1;
	run_id: number;
	run_attempt: number;
	event_sha: string;
	job: {
		key: string;
		id: string;
		matrix?: { shard: number };
		lanes: Record<string, LaneEvidence>;
		conclusion?: string;
	};
};

export type AggregateInput = {
	run_id: number;
	run_attempt: number;
	classifier: {
		result: string;
		outputs: Record<string, unknown>;
	};
	records: unknown[];
	central_results?: Record<string, string>;
};

const CENTRAL_PARENT_KEYS = [
	'verification',
	'audit-development',
	'audit-production',
	'api',
	'front-vitest',
	'e2e-build',
	'e2e-test',
	'e2e-cleanup',
] as const;

export type AggregateResult = {
	ok: boolean;
	expected_keys: string[];
	observed_keys: string[];
	failures: string[];
};

type JobContract = {
	id: string;
	lane: string;
	classifierLane?: ClassifierLane;
	expectedSteps: string[];
	sentinel: string;
};

type JobLaneContracts = Record<string, JobContract[]>;

const contract = (
	id: string,
	lane: string,
	expectedSteps: string[],
	classifierLane?: ClassifierLane,
): JobContract => {
	const sentinel =
		expectedSteps.find((step) => step.endsWith('.not-applicable')) ??
		`${id}.not-applicable`;
	return {
		id,
		lane,
		classifierLane,
		expectedSteps,
		sentinel,
	};
};

export const EXPECTED_JOB_LANES: JobLaneContracts = {
	classify: [
		contract('classify', 'classifier', [
			'classify.checkout',
			'classify.base_checkout',
			'classify.setup_node',
			'classify.run',
		]),
	],
	verification: [
		contract('verification', 'setup', [
			'verification.checkout',
			'verification.install_pnpm',
			'verification.setup_node',
			'verification.install_workspace',
		]),
		contract(
			'verification',
			'quality',
			['verification.quality', 'verification.quality.not-applicable'],
			'quality',
		),
		contract(
			'verification',
			'front',
			['verification.front', 'verification.front.not-applicable'],
			'front',
		),
		contract(
			'verification',
			'docs',
			['verification.docs', 'verification.docs.not-applicable'],
			'docs',
		),
		contract(
			'verification',
			'react',
			['verification.react', 'verification.react.not-applicable'],
			'react',
		),
		contract('verification', 'api-paths', ['verification.api-paths']),
	],
	'audit-development': [
		contract(
			'audit-development',
			'audit',
			[
				'audit-development.checkout',
				'audit-development.install_pnpm',
				'audit-development.setup_node',
				'audit-development.audit',
				'audit-development.fixtures',
				'audit-development.not-applicable',
			],
			'quality',
		),
	],
	'audit-production': [
		contract(
			'audit-production',
			'audit',
			[
				'audit-production.checkout',
				'audit-production.install_pnpm',
				'audit-production.setup_node',
				'audit-production.audit',
				'audit-production.fixtures',
				'audit-production.not-applicable',
			],
			'quality',
		),
	],
	api: [
		contract(
			'api',
			'api',
			[
				'api.checkout',
				'api.setup_dotnet',
				'api.install_pnpm',
				'api.setup_node',
				'api.suite',
				'api.not-applicable',
			],
			'api',
		),
	],
	'e2e-build': [
		contract(
			'e2e-build',
			'e2e',
			[
				'e2e-build.checkout',
				'e2e-build.image_tag',
				'e2e-build.image_root',
				'e2e-build.image_fork',
				'e2e-build.setup_buildx',
				'e2e-build.setup_runtime',
				'e2e-build.login',
				'e2e-build.images',
				'e2e-build.runtime_guard',
				'e2e-build.upload_images',
				'e2e-build.not-applicable',
			],
			'e2e',
		),
	],
	'e2e-cleanup': [
		contract(
			'e2e-cleanup',
			'e2e',
			[
				'e2e-cleanup.checkout',
				'e2e-cleanup.cleanup',
				'e2e-cleanup.not-applicable',
			],
			'e2e',
		),
	],
};

for (const shard of [1, 2, 3, 4]) {
	EXPECTED_JOB_LANES[`front-vitest/${shard}`] = [
		contract(
			'front-vitest',
			'front',
			[
				'front-vitest.checkout',
				'front-vitest.install_pnpm',
				'front-vitest.setup_node',
				'front-vitest.install_dependencies',
				'front-vitest.vitest',
				'front-vitest.not-applicable',
			],
			'front',
		),
	];
	EXPECTED_JOB_LANES[`e2e-test/${shard}`] = [
		contract(
			'e2e-test',
			'e2e',
			[
				'e2e-test.checkout',
				'e2e-test.install_pnpm',
				'e2e-test.setup_node',
				'e2e-test.install_dependencies',
				'e2e-test.login',
				'e2e-test.rerun_guard',
				'e2e-test.pull_stack',
				'e2e-test.download_images',
				'e2e-test.load_images',
				'e2e-test.up_stack',
				'e2e-test.wait_health',
				'e2e-test.playwright',
				'e2e-test.not-applicable',
			],
			'e2e',
		),
	];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const push = (failures: string[], message: string): void => {
	if (!failures.includes(message)) {
		failures.push(message);
	}
};

const isPrerequisiteStep = (id: string): boolean =>
	/\.(checkout|install_pnpm|setup_node|setup_dotnet)$/.test(id);

const validateSteps = (
	jobKey: string,
	laneName: string,
	lane: LaneEvidence,
	failures: string[],
): void => {
	const expected = [...lane.expected_steps];
	const rawSteps = Array.isArray(lane.steps) ? lane.steps : [];
	const observed = rawSteps
		.filter(isRecord)
		.map((step) => (typeof step.id === 'string' ? step.id : ''));
	const expectedSet = new Set(expected);
	const observedSet = new Set(observed);

	if (
		expectedSet.size !== expected.length ||
		observedSet.size !== observed.length
	) {
		push(
			failures,
			`${jobKey}/${laneName}: duplicate expected or observed step id`,
		);
	}

	for (const step of expected) {
		if (!observedSet.has(step)) {
			push(failures, `${jobKey}/${laneName}: missing step ${step}`);
		}
	}
	for (const step of observed) {
		if (!expectedSet.has(step)) {
			push(failures, `${jobKey}/${laneName}: unknown step ${step}`);
		}
	}

	for (const rawStep of rawSteps) {
		if (!isRecord(rawStep)) {
			push(failures, `${jobKey}/${laneName}: malformed step evidence`);
			continue;
		}
		const step = rawStep;
		if (
			typeof step.id !== 'string' ||
			!['executed', 'skipped'].includes(step.execution) ||
			!['success', 'failure', 'cancelled', 'skipped'].includes(step.outcome)
		) {
			push(failures, `${jobKey}/${laneName}: malformed step evidence`);
			continue;
		}
		if (step.execution === 'skipped' && step.outcome !== 'skipped') {
			push(
				failures,
				`${jobKey}/${laneName}/${step.id}: skipped execution must have skipped outcome`,
			);
		}
	}
};

export const validateCiLaneResult = (
	value: unknown,
	runId: number,
	runAttempt: number,
	failures: string[] = [],
): value is CiLaneResult => {
	if (!isRecord(value)) {
		push(failures, 'result artifact is not an object');
		return false;
	}
	if (value.schema_version !== 1) {
		push(failures, 'result artifact has an unsupported schema version');
	}
	if (value.run_id !== runId || value.run_attempt !== runAttempt) {
		push(failures, 'result artifact belongs to another run or attempt');
	}
	if (typeof value.event_sha !== 'string' || value.event_sha.length === 0) {
		push(failures, 'result artifact has no event_sha');
	}
	const job = value.job;
	if (
		!isRecord(job) ||
		typeof job.key !== 'string' ||
		typeof job.id !== 'string'
	) {
		push(failures, 'result artifact has malformed job identity');
		return false;
	}
	if (!isRecord(job.lanes)) {
		push(failures, `${job.key}: missing lanes`);
		return false;
	}
	for (const [laneName, lane] of Object.entries(job.lanes)) {
		if (!isRecord(lane)) {
			push(failures, `${job.key}/${laneName}: malformed lane`);
			continue;
		}
		if (!Array.isArray(lane.expected_steps) || !Array.isArray(lane.steps)) {
			push(failures, `${job.key}/${laneName}: missing step arrays`);
			continue;
		}
		validateSteps(job.key, laneName, lane as LaneEvidence, failures);
	}
	return failures.length === 0;
};

const validateLaneMode = (
	jobKey: string,
	laneName: string,
	lane: LaneEvidence,
	contractForLane: JobContract,
	failures: string[],
): void => {
	if (!['relevant', 'not_applicable'].includes(lane.mode)) {
		push(failures, `${jobKey}/${laneName}: unknown lane mode`);
		return;
	}
	const expected = new Set(contractForLane.expectedSteps);
	if (new Set(lane.expected_steps).size !== expected.size) {
		push(
			failures,
			`${jobKey}/${laneName}: expected step set differs from contract`,
		);
	}
	for (const step of expected) {
		if (!lane.expected_steps.includes(step)) {
			push(
				failures,
				`${jobKey}/${laneName}: expected step set differs from contract`,
			);
		}
	}
	const byId = new Map(lane.steps.map((step) => [step.id, step]));
	if (lane.mode === 'not_applicable') {
		for (const step of lane.steps) {
			if (step.id === contractForLane.sentinel) {
				if (step.execution !== 'executed' || step.outcome !== 'success') {
					push(failures, `${jobKey}/${laneName}: sentinel did not succeed`);
				}
				continue;
			}
			if (isPrerequisiteStep(step.id)) {
				if (step.execution !== 'executed' || step.outcome !== 'success') {
					push(
						failures,
						`${jobKey}/${laneName}: prerequisite ${step.id} did not succeed`,
					);
				}
				continue;
			}
			if (step.execution !== 'skipped' || step.outcome !== 'skipped') {
				push(failures, `${jobKey}/${laneName}: non-applicable work executed`);
			}
		}
		if (!byId.has(contractForLane.sentinel)) {
			push(failures, `${jobKey}/${laneName}: missing non-applicable sentinel`);
		}
		return;
	}

	for (const step of lane.steps) {
		if (!expected.has(step.id)) {
			continue;
		}
		if (step.id === contractForLane.sentinel) {
			if (step.execution !== 'skipped' || step.outcome !== 'skipped') {
				push(
					failures,
					`${jobKey}/${laneName}: relevant sentinel was not skipped`,
				);
			}
			continue;
		}
		if (step.execution !== 'executed' || step.outcome !== 'success') {
			push(
				failures,
				`${jobKey}/${laneName}: relevant step ${step.id} did not succeed`,
			);
		}
	}
};

const contractFor = (jobKey: string): JobContract[] => {
	const contracts = EXPECTED_JOB_LANES[jobKey];
	return contracts ?? [];
};

export const aggregateCiGate = (input: AggregateInput): AggregateResult => {
	const failures: string[] = [];
	const expectedKeys = [...EXPECTED_UPSTREAM_JOB_KEYS];
	const records = input.records;
	const observedKeys: string[] = [];

	if (input.classifier.result !== 'success') {
		push(
			failures,
			`classifier result must be success (found ${input.classifier.result})`,
		);
	}
	if (input.central_results !== undefined) {
		for (const key of CENTRAL_PARENT_KEYS) {
			if (input.central_results[key] !== 'success') {
				push(
					failures,
					`central parent ${key} must be success (found ${input.central_results[key] ?? 'missing'})`,
				);
			}
		}
		for (const key of Object.keys(input.central_results)) {
			if (
				!CENTRAL_PARENT_KEYS.includes(
					key as (typeof CENTRAL_PARENT_KEYS)[number],
				)
			) {
				push(failures, `unknown central parent result ${key}`);
			}
		}
	}
	for (const lane of CLASSIFIER_LANES) {
		if (
			input.classifier.outputs[lane] !== 'true' &&
			input.classifier.outputs[lane] !== 'false'
		) {
			push(failures, `classifier output ${lane} must be literal true or false`);
		}
	}
	if (!Array.isArray(records) || records.length !== expectedKeys.length) {
		push(
			failures,
			`expected exactly ${expectedKeys.length} upstream result artifacts`,
		);
	}

	const seen = new Set<string>();
	for (const raw of records) {
		const recordFailures: string[] = [];
		if (
			!validateCiLaneResult(
				raw,
				input.run_id,
				input.run_attempt,
				recordFailures,
			)
		) {
			for (const failure of recordFailures) {
				push(failures, failure);
			}
			continue;
		}
		const key = raw.job.key;
		observedKeys.push(key);
		if (seen.has(key)) {
			push(failures, `duplicate upstream result ${key}`);
		}
		seen.add(key);
		if (!expectedKeys.includes(key as UpstreamJobKey)) {
			push(failures, `unknown upstream result ${key}`);
			continue;
		}
		const expectedId = key.split('/')[0];
		if (raw.job.id !== expectedId) {
			push(failures, `${key}: job id must be ${expectedId}`);
		}
		if (key.includes('/')) {
			const expectedShard = Number(key.split('/')[1]);
			if (
				!isRecord(raw.job.matrix) ||
				raw.job.matrix.shard !== expectedShard ||
				Object.keys(raw.job.matrix).length !== 1
			) {
				push(
					failures,
					`${key}: matrix identity does not match the expected shard`,
				);
			}
		} else if (raw.job.matrix !== undefined) {
			push(failures, `${key}: non-matrix job must not carry matrix identity`);
		}
		const contracts = contractFor(key);
		const expectedLaneNames = new Set(contracts.map((item) => item.lane));
		for (const laneName of Object.keys(raw.job.lanes)) {
			if (!expectedLaneNames.has(laneName)) {
				push(failures, `${key}: unknown lane ${laneName}`);
			}
		}
		for (const laneContract of contracts) {
			const lane = raw.job.lanes[laneContract.lane];
			if (lane === undefined) {
				push(failures, `${key}: missing lane ${laneContract.lane}`);
				continue;
			}
			validateLaneMode(key, laneContract.lane, lane, laneContract, failures);
			if (
				laneContract.classifierLane !== undefined &&
				input.classifier.outputs[laneContract.classifierLane] !== undefined &&
				lane.mode !==
					(input.classifier.outputs[laneContract.classifierLane] === 'true'
						? 'relevant'
						: 'not_applicable')
			) {
				push(
					failures,
					`${key}/${laneContract.lane}: lane mode does not match classifier output`,
				);
			}
		}
		const result =
			input.central_results?.[key] ?? raw.job.conclusion ?? 'success';
		if (result !== 'success') {
			push(failures, `${key}: central result is ${result}`);
		}
	}

	for (const key of expectedKeys) {
		if (!seen.has(key)) {
			push(failures, `missing upstream result ${key}`);
		}
	}

	return {
		ok: failures.length === 0,
		expected_keys: expectedKeys,
		observed_keys: observedKeys,
		failures,
	};
};

const readRecords = (directory: string): unknown[] => {
	const records: unknown[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.json')) {
			continue;
		}
		records.push(
			JSON.parse(readFileSync(path.join(directory, entry.name), 'utf8')),
		);
	}
	return records;
};

const isDirectRun =
	process.argv[1]
		?.replaceAll('\\', '/')
		.endsWith('packages/scripts-ts/src/check-ci-gate-aggregation.ts') ?? false;

if (isDirectRun) {
	const directory = process.argv[2] ?? 'ci-results';
	const aggregateInput = {
		run_id: Number(process.env.GITHUB_RUN_ID ?? 0),
		run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
		classifier: {
			result: process.env.CI_CLASSIFIER_RESULT ?? 'success',
			outputs: JSON.parse(process.env.CI_CLASSIFIER_OUTPUTS ?? '{}'),
		},
		records: readRecords(directory),
	} satisfies AggregateInput;
	const result =
		process.env.CI_CENTRAL_RESULTS === undefined
			? aggregateCiGate(aggregateInput)
			: aggregateCiGate({
					...aggregateInput,
					central_results: JSON.parse(process.env.CI_CENTRAL_RESULTS),
				});
	console.log(JSON.stringify(result));
	if (!result.ok) {
		process.exit(1);
	}
}
