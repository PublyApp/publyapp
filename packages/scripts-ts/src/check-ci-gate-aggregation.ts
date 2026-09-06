import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { NON_VITEST_COMMANDS } from './ci-non-vitest-manifest.ts';

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
	signal?: string | null;
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
	workflow_path: string;
	workflow_ref: string;
	workflow_event: string;
	artifact_name: string;
	artifact_filename: string;
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
	event_sha?: string;
	event_name?: string;
	workflow_path?: string;
	workflow_ref?: string;
	classifier: {
		result: string;
		outputs: Record<string, unknown>;
	};
	records: unknown[];
	central_results?: Record<string, string>;
	artifact_filenames?: string[];
	observed_artifacts?: ObservedArtifact[];
};

export type ObservedArtifact = {
	container: string;
	filename: string;
	file_path: string;
	record: unknown;
};

export type CiLaneResultContext = {
	runId: number;
	runAttempt: number;
	eventSha: string;
	eventName: string;
	workflowPath: string;
	workflowRef: string;
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

const baseJobLaneContracts = {
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
			'verification.setup_dotnet',
			'verification.setup_just',
			'verification.install_workspace',
			'verification.trusted_postinstall',
			'verification.prepare_hooks',
			'verification.materialize_env',
		]),
		contract(
			'verification',
			'quality',
			[
				'verification.assert_pins',
				'verification.format',
				'verification.formatter_scope',
				'verification.lint',
				'verification.complexity',
				'verification.lint_ts_test',
				'verification.lint_ts_typecheck',
				'verification.client_typecheck',
				'verification.knip',
				'verification.shared_typecheck',
				'verification.shared_test',
				'verification.dotnet_restore',
				'verification.dotnet_build',
				'verification.nuget_audit',
				'verification.nuget_fixtures',
				'verification.dependency_health',
				'verification.action_pins',
				'verification.deploy_env_docs',
				'verification.analyzers',
				'verification.ci_contract_tests',
				'verification.ci_drift_tests',
				'verification.ci_drift',
				'verification.ci_changed_paths_test',
				'verification.ci_referenced_paths_test',
				'verification.ci_guard_tests',
				'verification.front_lint_test',
				'verification.complexity_test',
				'verification.action_versions_test',
				'verification.action_versions',
				'verification.production_audit_test',
				'verification.npm_audit_test',
				'verification.project_closure',
				'verification.quality.not-applicable',
			],
			'quality',
		),
		contract(
			'verification',
			'front',
			[
				'verification.front_build',
				'verification.front_css',
				'verification.front_font',
				'verification.front_smoke',
				'verification.front_typecheck',
				'verification.front_lint',
				'verification.front_design',
				'verification.front_column',
				'verification.front_static',
				'verification.front_react_compiler',
				'verification.front',
				'verification.front_proofs',
				'verification.front_vitest_coverage',
				'verification.front.not-applicable',
			],
			'front',
		),
		contract(
			'verification',
			'docs',
			[
				'verification.docs_links_test',
				'verification.docs_prune_test',
				'verification.docs_links',
				'verification.docs_prune',
				'verification.docs.not-applicable',
			],
			'docs',
		),
		contract(
			'verification',
			'react',
			[
				'verification.resolve_react_base',
				'verification.react_doctor',
				'verification.react.not-applicable',
			],
			'react',
		),
		contract('verification', 'tracked-guards', [
			'verification.no_ignored_tracked',
			'verification.no_dockerignore_shadow',
		]),
		contract('verification', 'api-paths', [
			'verification.api-paths-tests',
			'verification.api-paths',
		]),
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
				'api.setup_just',
				'api.install_workspace',
				'api.materialize_env',
				'api.restore_tools',
				'api.build_api',
				'api.openapi_drift',
				'api.generate_client',
				'api.client_drift',
				'api.openapi_contract',
				'api.suite',
				'api.test_results',
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

const matrixJobLaneContracts = Object.fromEntries(
	[1, 2, 3, 4].flatMap((shard) => [
		[
			`front-vitest/${shard}`,
			[
				contract(
					'front-vitest',
					'front',
					[
						'front-vitest.checkout',
						'front-vitest.install_pnpm',
						'front-vitest.setup_node',
						'front-vitest.install_dependencies',
						'front-vitest.trusted_postinstall',
						'front-vitest.prepare_hooks',
						'front-vitest.vitest',
						'front-vitest.report_upload',
						'front-vitest.not-applicable',
					],
					'front',
				),
			],
		],
		[
			`e2e-test/${shard}`,
			[
				contract(
					'e2e-test',
					'e2e',
					[
						'e2e-test.checkout',
						'e2e-test.install_pnpm',
						'e2e-test.setup_node',
						'e2e-test.assert_pins',
						'e2e-test.install_dependencies',
						'e2e-test.login',
						'e2e-test.rerun_guard',
						'e2e-test.pull_stack',
						'e2e-test.download_images',
						'e2e-test.load_images',
						'e2e-test.cache_playwright',
						'e2e-test.up_stack',
						'e2e-test.wait_health',
						'e2e-test.playwright',
						'e2e-test.report_upload',
						'e2e-test.teardown',
						'e2e-test.not-applicable',
					],
					'e2e',
				),
			],
		],
	]),
) satisfies JobLaneContracts;

export const EXPECTED_JOB_LANES = {
	...baseJobLaneContracts,
	...matrixJobLaneContracts,
} satisfies JobLaneContracts;

export const getExpectedJobLanes = (
	jobKey: string,
): JobContract[] | undefined =>
	EXPECTED_JOB_LANES[jobKey as keyof typeof EXPECTED_JOB_LANES];

const expectedJobLaneContractCount = 7 + 2 * 4;
if (Object.keys(EXPECTED_JOB_LANES).length !== expectedJobLaneContractCount) {
	throw new Error('CI job lane contract table has an unexpected job count');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const push = (failures: string[], message: string): void => {
	if (!failures.includes(message)) {
		failures.push(message);
	}
};

const isValidExitCode = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isValidSignal = (value: unknown): value is string | null =>
	value === null || typeof value === 'string';

const isPrerequisiteStep = (id: string): boolean =>
	/\.(checkout|install_pnpm|setup_node|setup_dotnet|setup_just)$/.test(id);

const isFailureOnlyStep = (id: string): boolean =>
	id.endsWith('.report_upload') || id.endsWith('.test_results');

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
		const allowedStepKeys = [
			'id',
			'execution',
			'outcome',
			'exit_code',
			'signal',
		];
		if (Object.keys(step).some((key) => !allowedStepKeys.includes(key))) {
			push(failures, `${jobKey}/${laneName}: unknown step field`);
		}
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
		if (step.execution === 'executed' && step.outcome === 'skipped') {
			push(
				failures,
				`${jobKey}/${laneName}/${step.id}: executed step must not have skipped outcome`,
			);
		}
		if (step.exit_code !== undefined && !isValidExitCode(step.exit_code)) {
			push(failures, `${jobKey}/${laneName}/${step.id}: invalid exit_code`);
		}
		if (step.signal !== undefined && !isValidSignal(step.signal)) {
			push(failures, `${jobKey}/${laneName}/${step.id}: invalid signal`);
		}
	}
	if (JSON.stringify(observed) !== JSON.stringify(expected)) {
		push(
			failures,
			`${jobKey}/${laneName}: step order differs from expected_steps`,
		);
	}
};

const validateExactKeys = (
	value: Record<string, unknown>,
	required: string[],
	optional: string[],
	label: string,
	failures: string[],
): void => {
	const allowed = new Set([...required, ...optional]);
	for (const key of Object.keys(value)) {
		if (!allowed.has(key)) {
			push(failures, `${label}: unknown field ${key}`);
		}
	}
	for (const key of required) {
		if (!(key in value)) {
			push(failures, `${label}: missing field ${key}`);
		}
	}
};

const validateFrontReport = (
	value: unknown,
	jobKey: string,
	failures: string[],
): void => {
	if (!isRecord(value)) {
		push(failures, `${jobKey}: malformed front nested report`);
		return;
	}
	validateExactKeys(value, ['front'], [], `${jobKey}/report`, failures);
	const front = value.front;
	if (!isRecord(front)) {
		push(failures, `${jobKey}: malformed front report`);
		return;
	}
	validateExactKeys(
		front,
		['non_vitest'],
		[],
		`${jobKey}/report/front`,
		failures,
	);
	const nonVitest = front.non_vitest;
	if (!isRecord(nonVitest)) {
		push(failures, `${jobKey}: malformed non-Vitest report`);
		return;
	}
	validateExactKeys(
		nonVitest,
		['commands', 'ok'],
		[],
		`${jobKey}/report/front/non_vitest`,
		failures,
	);
	if (!Array.isArray(nonVitest.commands) || typeof nonVitest.ok !== 'boolean') {
		push(failures, `${jobKey}: malformed non-Vitest report values`);
		return;
	}
	if (nonVitest.commands.length !== NON_VITEST_COMMANDS.length) {
		push(failures, `${jobKey}: front report must contain exactly 30 commands`);
	}
	let allSucceeded = true;
	for (const [index, rawCommand] of nonVitest.commands.entries()) {
		if (!isRecord(rawCommand)) {
			push(failures, `${jobKey}: malformed front report command ${index + 1}`);
			allSucceeded = false;
			continue;
		}
		validateExactKeys(
			rawCommand,
			['id', 'argv', 'execution', 'outcome'],
			['exit_code', 'signal'],
			`${jobKey}/report/command-${index + 1}`,
			failures,
		);
		const expected = NON_VITEST_COMMANDS[index];
		if (
			expected === undefined ||
			rawCommand.id !== expected.id ||
			JSON.stringify(rawCommand.argv) !== JSON.stringify(expected.argv)
		) {
			push(
				failures,
				`${jobKey}: front report command argv differs at ${index + 1}`,
			);
		}
		if (
			rawCommand.execution !== 'executed' ||
			!['success', 'failure', 'cancelled'].includes(String(rawCommand.outcome))
		) {
			push(failures, `${jobKey}: malformed front report command ${index + 1}`);
		}
		if (
			rawCommand.exit_code !== undefined &&
			!isValidExitCode(rawCommand.exit_code)
		) {
			push(failures, `${jobKey}: invalid front report exit_code ${index + 1}`);
		}
		if (rawCommand.signal !== undefined && !isValidSignal(rawCommand.signal)) {
			push(failures, `${jobKey}: invalid front report signal ${index + 1}`);
		}
		if (rawCommand.outcome !== 'success') {
			allSucceeded = false;
		}
	}
	if (nonVitest.ok !== allSucceeded) {
		push(
			failures,
			`${jobKey}: front report ok does not match command outcomes`,
		);
	}
	if (nonVitest.ok !== true) {
		push(
			failures,
			`${jobKey}: relevant front non-Vitest report must declare ok: true`,
		);
	}
};

export function validateCiLaneResult(
	value: unknown,
	context: CiLaneResultContext,
	failures?: string[],
): value is CiLaneResult;
export function validateCiLaneResult(
	value: unknown,
	runId: number,
	runAttempt: number,
	failures?: string[],
): value is CiLaneResult;
export function validateCiLaneResult(
	value: unknown,
	contextOrRunId: CiLaneResultContext | number,
	runAttemptOrFailures: number | string[] = [],
	legacyFailures: string[] = [],
): value is CiLaneResult {
	const strict = typeof contextOrRunId !== 'number';
	const context: CiLaneResultContext = strict
		? contextOrRunId
		: {
				runId: contextOrRunId,
				runAttempt:
					typeof runAttemptOrFailures === 'number' ? runAttemptOrFailures : 0,
				eventSha: '',
				eventName: '',
				workflowPath: '',
				workflowRef: '',
			};
	const failures = Array.isArray(runAttemptOrFailures)
		? runAttemptOrFailures
		: legacyFailures;
	if (!isRecord(value)) {
		push(failures, 'result artifact is not an object');
		return false;
	}
	if (strict) {
		validateExactKeys(
			value,
			[
				'schema_version',
				'run_id',
				'run_attempt',
				'event_sha',
				'workflow_path',
				'workflow_ref',
				'workflow_event',
				'artifact_name',
				'artifact_filename',
				'job',
			],
			[],
			'result artifact',
			failures,
		);
	}
	if (value.schema_version !== 1) {
		push(failures, 'result artifact has an unsupported schema version');
	}
	const runId = value.run_id;
	const runAttempt = value.run_attempt;
	if (
		strict &&
		(typeof runId !== 'number' ||
			!Number.isInteger(runId) ||
			runId < 1 ||
			typeof runAttempt !== 'number' ||
			!Number.isInteger(runAttempt) ||
			runAttempt < 1)
	) {
		push(failures, 'result artifact has malformed run identity');
	}
	if (runId !== context.runId || runAttempt !== context.runAttempt) {
		push(failures, 'result artifact belongs to another run or attempt');
	}
	if (
		typeof value.event_sha !== 'string' ||
		value.event_sha.length === 0 ||
		(strict && value.event_sha !== context.eventSha)
	) {
		push(failures, 'result artifact has no event_sha');
	}
	if (strict) {
		for (const field of [
			'workflow_path',
			'workflow_ref',
			'workflow_event',
			'artifact_name',
			'artifact_filename',
		] as const) {
			if (typeof value[field] !== 'string' || value[field].length === 0) {
				push(failures, `result artifact has malformed ${field}`);
			}
		}
		if (value.workflow_path !== context.workflowPath) {
			push(failures, 'result artifact workflow path does not match');
		}
		if (value.workflow_ref !== context.workflowRef) {
			push(failures, 'result artifact workflow ref does not match');
		}
		if (value.workflow_event !== context.eventName) {
			push(failures, 'result artifact workflow event does not match');
		}
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
	if (strict) {
		validateExactKeys(
			job,
			['key', 'id', 'conclusion', 'lanes'],
			['matrix', 'report'],
			`${job.key}: job`,
			failures,
		);
		const expectedArtifactKey = job.key.replace('/', '-');
		if (value.artifact_filename !== `${expectedArtifactKey}.json`) {
			push(failures, `${job.key}: artifact filename does not match job key`);
		}
		if (
			value.artifact_name !==
			`ci-lane-result-${context.runId}-${context.runAttempt}-${expectedArtifactKey}`
		) {
			push(failures, `${job.key}: artifact name does not match job key`);
		}
		if (typeof job.conclusion !== 'string') {
			push(failures, `${job.key}: malformed conclusion`);
		} else if (!['success', 'failure'].includes(job.conclusion)) {
			push(failures, `${job.key}: unsupported conclusion`);
		}
		if (job.id !== job.key.split('/')[0]) {
			push(failures, `${job.key}: job id does not match job key`);
		}
		if (job.matrix !== undefined) {
			if (!job.key.includes('/') || !isRecord(job.matrix)) {
				push(failures, `${job.key}: malformed matrix identity`);
			} else {
				validateExactKeys(
					job.matrix,
					['shard'],
					[],
					`${job.key}: matrix`,
					failures,
				);
			}
		}
	}
	if (job.report !== undefined && job.id !== 'verification') {
		push(failures, `${job.key}: nested report is only allowed on verification`);
	}
	if (!isRecord(job.lanes)) {
		push(failures, `${job.key}: missing lanes`);
		return false;
	}
	if (strict) {
		const contracts = getExpectedJobLanes(job.key);
		if (contracts === undefined) {
			push(failures, `${job.key}: unknown job key`);
		} else {
			const knownLaneNames = new Set(contracts.map((item) => item.lane));
			for (const laneName of Object.keys(job.lanes)) {
				if (!knownLaneNames.has(laneName)) {
					push(failures, `${job.key}: unknown lane ${laneName}`);
				}
			}
		}
		if (job.key.includes('/')) {
			const expectedShard = Number(job.key.split('/')[1]);
			if (!isRecord(job.matrix) || job.matrix.shard !== expectedShard) {
				push(failures, `${job.key}: malformed matrix identity`);
			}
		} else if (job.matrix !== undefined) {
			push(
				failures,
				`${job.key}: non-matrix job must not carry matrix identity`,
			);
		}
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
		if (strict) {
			if (
				typeof lane.mode !== 'string' ||
				!['relevant', 'not_applicable'].includes(lane.mode) ||
				lane.expected_steps.some((step) => typeof step !== 'string')
			) {
				push(
					failures,
					`${job.key}/${laneName}: malformed lane mode or expected_steps`,
				);
			}
			validateExactKeys(
				lane,
				['mode', 'expected_steps', 'steps'],
				[],
				`${job.key}/${laneName}: lane`,
				failures,
			);
		}
		validateSteps(job.key, laneName, lane as LaneEvidence, failures);
	}
	if (strict && job.id === 'verification' && isRecord(job.lanes.front)) {
		const front = job.lanes.front as Record<string, unknown>;
		if (front.mode === 'relevant') {
			if (job.report === undefined) {
				push(failures, `${job.key}: missing front nested report`);
			} else {
				validateFrontReport(job.report, job.key, failures);
			}
		} else if (job.report !== undefined) {
			push(
				failures,
				`${job.key}: irrelevant front lane must not include nested report`,
			);
		}
	}
	return failures.length === 0;
}

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
				if (step.execution === 'skipped' && step.outcome === 'skipped') {
					continue;
				}
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
		if (isFailureOnlyStep(step.id)) {
			if (step.execution === 'executed' && step.outcome !== 'success') {
				push(
					failures,
					`${jobKey}/${laneName}: failure-only diagnostic did not complete successfully`,
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
	const contracts = getExpectedJobLanes(jobKey);
	return contracts ?? [];
};

export const aggregateCiGate = (input: AggregateInput): AggregateResult => {
	const failures: string[] = [];
	const expectedKeys = [...EXPECTED_UPSTREAM_JOB_KEYS];
	const records = input.records;
	const observations = input.observed_artifacts;
	const observedKeys: string[] = [];
	const strictContext =
		input.event_sha !== undefined &&
		input.event_name !== undefined &&
		input.workflow_path !== undefined &&
		input.workflow_ref !== undefined
			? {
					runId: input.run_id,
					runAttempt: input.run_attempt,
					eventSha: input.event_sha,
					eventName: input.event_name,
					workflowPath: input.workflow_path,
					workflowRef: input.workflow_ref,
				}
			: undefined;
	if (strictContext && input.artifact_filenames !== undefined) {
		const expectedFilenames = expectedKeys.map(
			(key) => `${key.replace('/', '-')}.json`,
		);
		if (
			input.artifact_filenames.length !== expectedFilenames.length ||
			new Set(input.artifact_filenames).size !==
				input.artifact_filenames.length ||
			input.artifact_filenames.some(
				(filename) => !expectedFilenames.includes(filename),
			) ||
			expectedFilenames.some(
				(filename) => !input.artifact_filenames?.includes(filename),
			)
		) {
			push(
				failures,
				'exact result artifact filename set is missing, renamed, duplicated, or unknown',
			);
		}
	}
	if (strictContext && observations === undefined) {
		push(
			failures,
			'observed artifact container/filename/path associations are required',
		);
	}
	if (strictContext && observations !== undefined) {
		const seenContainers = new Set<string>();
		const seenPaths = new Set<string>();
		for (const observation of observations) {
			if (
				!isRecord(observation) ||
				typeof observation.container !== 'string' ||
				typeof observation.filename !== 'string' ||
				typeof observation.file_path !== 'string' ||
				!('record' in observation)
			) {
				push(failures, 'malformed observed artifact association');
				continue;
			}
			if (seenContainers.has(observation.container)) {
				push(
					failures,
					`duplicate observed artifact container ${observation.container}`,
				);
			}
			seenContainers.add(observation.container);
			if (seenPaths.has(observation.file_path)) {
				push(
					failures,
					`duplicate observed artifact path ${observation.file_path}`,
				);
			}
			seenPaths.add(observation.file_path);
			if (
				observation.file_path !==
				`${observation.container}/${observation.filename}`
			) {
				push(
					failures,
					`observed artifact path does not bind container and filename: ${observation.file_path}`,
				);
			}
		}
		if (observations.length !== expectedKeys.length) {
			push(
				failures,
				`expected exactly ${expectedKeys.length} observed artifacts`,
			);
		}
	}

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
	const inputRecords =
		observations === undefined
			? records
			: observations.map((observation) => observation.record);
	if (
		!Array.isArray(inputRecords) ||
		inputRecords.length !== expectedKeys.length
	) {
		push(
			failures,
			`expected exactly ${expectedKeys.length} upstream result artifacts`,
		);
	}

	const seen = new Set<string>();
	for (const [index, raw] of inputRecords.entries()) {
		const recordFailures: string[] = [];
		const valid = strictContext
			? validateCiLaneResult(raw, strictContext, recordFailures)
			: validateCiLaneResult(
					raw,
					input.run_id,
					input.run_attempt,
					recordFailures,
				);
		if (!valid) {
			for (const failure of recordFailures) {
				push(failures, failure);
			}
			continue;
		}
		const record = raw as CiLaneResult;
		if (strictContext && observations !== undefined) {
			const observation = observations[index];
			if (observation === undefined) {
				push(failures, 'missing observed artifact association');
			} else {
				if (observation.container !== record.artifact_name) {
					push(
						failures,
						`${record.job.key}: observed artifact container does not match record identity`,
					);
				}
				if (observation.filename !== record.artifact_filename) {
					push(
						failures,
						`${record.job.key}: observed artifact filename does not match record identity`,
					);
				}
			}
		}
		const key = record.job.key;
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
		if (record.job.id !== expectedId) {
			push(failures, `${key}: job id must be ${expectedId}`);
		}
		if (key.includes('/')) {
			const expectedShard = Number(key.split('/')[1]);
			if (
				!isRecord(record.job.matrix) ||
				record.job.matrix.shard !== expectedShard ||
				Object.keys(record.job.matrix).length !== 1
			) {
				push(
					failures,
					`${key}: matrix identity does not match the expected shard`,
				);
			}
		} else if (record.job.matrix !== undefined) {
			push(failures, `${key}: non-matrix job must not carry matrix identity`);
		}
		const contracts = contractFor(key);
		const expectedLaneNames = new Set(contracts.map((item) => item.lane));
		for (const laneName of Object.keys(record.job.lanes)) {
			if (!expectedLaneNames.has(laneName)) {
				push(failures, `${key}: unknown lane ${laneName}`);
			}
		}
		for (const laneContract of contracts) {
			const lane = record.job.lanes[laneContract.lane];
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
			input.central_results?.[key] ?? record.job.conclusion ?? 'success';
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

type ArtifactRead = {
	records: unknown[];
	filenames: string[];
	observed_artifacts: ObservedArtifact[];
	failures: string[];
};

const readRecords = (directory: string): ArtifactRead => {
	const records: unknown[] = [];
	const filenames: string[] = [];
	const observed_artifacts: ObservedArtifact[] = [];
	const failures: string[] = [];
	let entries;
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		return {
			records,
			filenames,
			observed_artifacts,
			failures: [`unable to read result artifact directory: ${String(error)}`],
		};
	}
	for (const entry of entries) {
		if (!entry.isDirectory()) {
			if (entry.isFile() && entry.name.endsWith('.json')) {
				failures.push(
					`${entry.name}: result artifacts must retain container directories`,
				);
			}
			continue;
		}
		const container = entry.name;
		const artifactDirectory = path.join(directory, container);
		const files = readdirSync(artifactDirectory, {
			withFileTypes: true,
		}).filter((child) => child.isFile() && child.name.endsWith('.json'));
		if (files.length !== 1) {
			failures.push(`${container}: expected exactly one JSON artifact file`);
			continue;
		}
		const filename = files[0].name;
		const filePath = `${container}/${filename}`;
		filenames.push(filename);
		try {
			const record = JSON.parse(
				readFileSync(path.join(artifactDirectory, filename), 'utf8'),
			);
			records.push(record);
			observed_artifacts.push({
				container,
				filename,
				file_path: filePath,
				record,
			});
		} catch (error) {
			failures.push(`${filePath}: malformed JSON artifact: ${String(error)}`);
		}
	}
	return { records, filenames, observed_artifacts, failures };
};

const isDirectRun =
	process.argv[1]
		?.replaceAll('\\', '/')
		.endsWith('packages/scripts-ts/src/check-ci-gate-aggregation.ts') ?? false;

if (isDirectRun) {
	const directory = process.argv[2] ?? 'ci-results';
	const read = readRecords(directory);
	const aggregateInput = {
		run_id: Number(process.env.GITHUB_RUN_ID ?? 0),
		run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? 1),
		event_sha: process.env.GITHUB_SHA ?? '',
		event_name: process.env.GITHUB_EVENT_NAME ?? '',
		workflow_path: process.env.CI_WORKFLOW_PATH ?? '',
		workflow_ref: process.env.CI_WORKFLOW_REF ?? '',
		classifier: {
			result: process.env.CI_CLASSIFIER_RESULT ?? 'success',
			outputs: JSON.parse(process.env.CI_CLASSIFIER_OUTPUTS ?? '{}'),
		},
		records: read.records,
		artifact_filenames: read.filenames,
		observed_artifacts: read.observed_artifacts,
	} satisfies AggregateInput;
	const result =
		process.env.CI_CENTRAL_RESULTS === undefined
			? aggregateCiGate(aggregateInput)
			: aggregateCiGate({
					...aggregateInput,
					central_results: JSON.parse(process.env.CI_CENTRAL_RESULTS),
				});
	for (const failure of read.failures) {
		push(result.failures, failure);
	}
	result.ok = result.failures.length === 0;
	console.log(JSON.stringify(result));
	if (!result.ok) {
		process.exit(1);
	}
}
