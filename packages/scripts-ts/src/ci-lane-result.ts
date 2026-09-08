import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export type LaneResultMode = 'relevant' | 'not_applicable';

export type LaneResultOptions = {
	jobKey: string;
	lane: string;
	expectedSteps: string[];
	mode: LaneResultMode;
	runId: number;
	runAttempt: number;
	eventSha: string;
	workflowPath?: string;
	workflowRef?: string;
	workflowEvent?: string;
	stepResults: Record<string, StepResult>;
};

export type StepResult = {
	outcome: 'success' | 'failure' | 'cancelled' | 'skipped';
	exit_code?: number;
	signal?: string | null;
};

export type LaneResultReport = {
	front?: {
		non_vitest?: {
			commands: unknown[];
			ok: boolean;
		};
	};
};

export type StepEvidence = StepResult & {
	id: string;
	execution: 'executed' | 'skipped';
};

export const E2E_BUILD_TRANSPORT_STEPS = [
	'e2e-build.login',
	'e2e-build.upload_images',
] as const;

export const hasE2eBuildTransportPair = (
	expectedSteps: readonly string[],
): boolean =>
	E2E_BUILD_TRANSPORT_STEPS.every((id) => expectedSteps.includes(id));

export const isE2eBuildTransportStep = (id: string): boolean =>
	E2E_BUILD_TRANSPORT_STEPS.includes(
		id as (typeof E2E_BUILD_TRANSPORT_STEPS)[number],
	);

export const isValidE2eBuildTransportPair = (
	expectedSteps: readonly string[],
	steps: readonly Pick<StepEvidence, 'id' | 'execution' | 'outcome'>[],
): boolean => {
	if (!hasE2eBuildTransportPair(expectedSteps)) {
		return true;
	}

	const byId = new Map(steps.map((step) => [step.id, step]));
	const login = byId.get('e2e-build.login');
	const uploadImages = byId.get('e2e-build.upload_images');
	return (
		(login?.execution === 'executed' &&
			login.outcome === 'success' &&
			uploadImages?.execution === 'skipped' &&
			uploadImages.outcome === 'skipped') ||
		(login?.execution === 'skipped' &&
			login.outcome === 'skipped' &&
			uploadImages?.execution === 'executed' &&
			uploadImages.outcome === 'success')
	);
};

const isPrerequisiteStep = (id: string): boolean =>
	/\.(checkout|install_pnpm|setup_node|setup_dotnet|setup_just)$/.test(id);

const laneSucceeded = (
	mode: LaneResultMode,
	expectedSteps: readonly string[],
	steps: StepEvidence[],
): boolean => {
	if (mode === 'relevant') {
		if (!isValidE2eBuildTransportPair(expectedSteps, steps)) {
			return false;
		}
		const hasTransportPair = hasE2eBuildTransportPair(expectedSteps);
		for (const step of steps) {
			if (hasTransportPair && isE2eBuildTransportStep(step.id)) {
				continue;
			}
			if (step.id.endsWith('.not-applicable')) {
				if (step.execution !== 'skipped' || step.outcome !== 'skipped') {
					return false;
				}
				continue;
			}
			if (
				step.id.endsWith('.report_upload') ||
				step.id.endsWith('.test_results')
			) {
				if (step.execution === 'skipped' && step.outcome === 'skipped') {
					continue;
				}
				if (step.execution !== 'executed' || step.outcome !== 'success') {
					return false;
				}
				continue;
			}
			if (step.outcome !== 'success') {
				return false;
			}
		}
		return true;
	}

	const sentinel = steps.find((step) => step.id.endsWith('.not-applicable'));
	if (sentinel === undefined) {
		return false;
	}

	for (const step of steps) {
		if (step.id === sentinel.id) {
			if (step.execution !== 'executed' || step.outcome !== 'success') {
				return false;
			}
			continue;
		}
		if (isPrerequisiteStep(step.id)) {
			if (step.execution === 'skipped' && step.outcome === 'skipped') {
				continue;
			}
			if (step.execution !== 'executed' || step.outcome !== 'success') {
				return false;
			}
			continue;
		}
		if (step.execution !== 'skipped' || step.outcome !== 'skipped') {
			return false;
		}
	}

	return true;
};

export const createCiLaneResult = ({
	jobKey,
	lane,
	expectedSteps,
	mode,
	runId,
	runAttempt,
	eventSha,
	workflowPath,
	workflowRef,
	workflowEvent,
	stepResults,
	report,
}: LaneResultOptions & { report?: LaneResultReport }) => {
	const steps: StepEvidence[] = expectedSteps.map((id) => {
		const result = stepResults[id];
		if (result === undefined) {
			throw new Error(`missing workflow outcome for ${id}`);
		}
		if (
			!['success', 'failure', 'cancelled', 'skipped'].includes(result.outcome)
		) {
			throw new Error(`invalid workflow outcome for ${id}`);
		}
		return {
			id,
			execution: result.outcome === 'skipped' ? 'skipped' : 'executed',
			...result,
		};
	});
	const conclusion = laneSucceeded(mode, expectedSteps, steps)
		? 'success'
		: 'failure';
	const job = {
		schema_version: 1 as const,
		run_id: runId,
		run_attempt: runAttempt,
		event_sha: eventSha,
		workflow_path: workflowPath ?? '',
		workflow_ref: workflowRef ?? '',
		workflow_event: workflowEvent ?? '',
		artifact_name: `ci-lane-result-${runId}-${runAttempt}-${jobKey.replace('/', '-')}`,
		artifact_filename: `${jobKey.replace('/', '-')}.json`,
		job: {
			key: jobKey,
			id: jobKey.split('/')[0],
			conclusion,
			lanes: {
				[lane]: {
					mode,
					expected_steps: expectedSteps,
					steps,
				},
			},
		},
	};
	if (report !== undefined) {
		Object.assign(job.job, { report });
	}
	if (jobKey.includes('/')) {
		Object.assign(job.job, { matrix: { shard: Number(jobKey.split('/')[1]) } });
	}
	return job;
};

export const parseClassifierMode = (value: unknown): LaneResultMode => {
	if (value === 'true') {
		return 'relevant';
	}
	if (value === 'false') {
		return 'not_applicable';
	}
	throw new Error('classifier lane mode must be the literal true or false');
};

const parseExplicitMode = (value: unknown): LaneResultMode => {
	if (value === 'relevant' || value === 'not_applicable') {
		return value;
	}
	throw new Error('explicit lane mode must be relevant or not_applicable');
};

const isDirectRun =
	process.argv[1]
		?.replaceAll('\\', '/')
		.endsWith('packages/scripts-ts/src/ci-lane-result.ts') ?? false;

if (isDirectRun) {
	const jobKey = process.env.CI_JOB_KEY;
	const laneSpecs = JSON.parse(process.env.CI_LANE_SPECS ?? '{}') as Record<
		string,
		string[]
	>;
	if (!jobKey || Object.keys(laneSpecs).length === 0) {
		throw new Error('CI_JOB_KEY and CI_LANE_SPECS are required');
	}
	const runId = Number(process.env.GITHUB_RUN_ID ?? 0);
	const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT ?? 1);
	const eventSha = process.env.GITHUB_SHA ?? '';
	const stepResults = JSON.parse(process.env.CI_STEP_RESULTS ?? '{}') as Record<
		string,
		StepResult
	>;
	const classifierOutputs = JSON.parse(
		process.env.CI_CLASSIFIER_OUTPUTS ?? '{}',
	) as Record<string, string>;
	const explicitModes = JSON.parse(process.env.CI_LANE_MODES ?? '{}') as Record<
		string,
		unknown
	>;
	const lanes = Object.entries(laneSpecs);
	const modes = new Map(
		lanes.map(([laneName]) => [
			laneName,
			explicitModes[laneName] === undefined
				? parseClassifierMode(classifierOutputs[laneName])
				: parseExplicitMode(explicitModes[laneName]),
		]),
	);
	const reportPath = process.env.CI_NESTED_REPORT_PATH;
	const report =
		reportPath && modes.get('front') === 'relevant'
			? JSON.parse(await readFile(reportPath, 'utf8'))
			: undefined;
	const first = lanes[0];
	if (first === undefined) {
		throw new Error('CI_LANE_SPECS must contain at least one lane');
	}
	const result = createCiLaneResult({
		jobKey,
		lane: first[0],
		expectedSteps: first[1],
		mode: modes.get(first[0]) ?? parseClassifierMode(undefined),
		runId,
		runAttempt,
		eventSha,
		workflowPath: process.env.CI_WORKFLOW_PATH,
		workflowRef: process.env.CI_WORKFLOW_REF,
		workflowEvent: process.env.CI_WORKFLOW_EVENT,
		stepResults,
		report,
	});
	for (const [laneName, expectedSteps] of lanes.slice(1)) {
		const laneResult = createCiLaneResult({
			jobKey,
			lane: laneName,
			expectedSteps,
			mode: modes.get(laneName) ?? parseClassifierMode(undefined),
			runId,
			runAttempt,
			eventSha,
			workflowPath: process.env.CI_WORKFLOW_PATH,
			workflowRef: process.env.CI_WORKFLOW_REF,
			workflowEvent: process.env.CI_WORKFLOW_EVENT,
			stepResults,
			report,
		});
		result.job.lanes[laneName] = laneResult.job.lanes[laneName];
	}
	result.job.conclusion = Object.values(result.job.lanes).every((lane) =>
		laneSucceeded(lane.mode, lane.expected_steps, lane.steps),
	)
		? 'success'
		: 'failure';
	const output = path.join(
		process.env.CI_RESULT_DIR ?? 'ci-results',
		`${jobKey.replace('/', '-')}.json`,
	);
	await mkdir(path.dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
	process.exit(result.job.conclusion === 'success' ? 0 : 1);
}
