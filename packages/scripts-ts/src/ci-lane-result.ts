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
	stepResults: Record<string, StepResult>;
};

export type StepResult = {
	outcome: 'success' | 'failure' | 'cancelled' | 'skipped';
	exit_code?: number;
	signal?: string;
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

const isPrerequisiteStep = (id: string): boolean =>
	/\.(checkout|install_pnpm|setup_node|setup_dotnet)$/.test(id);

const laneSucceeded = (
	mode: LaneResultMode,
	steps: StepEvidence[],
): boolean => {
	if (mode === 'relevant') {
		return steps.every((step) => step.outcome === 'success');
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
			if (step.outcome !== 'success') {
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
	const conclusion = laneSucceeded(mode, steps) ? 'success' : 'failure';
	const job = {
		schema_version: 1 as const,
		run_id: runId,
		run_attempt: runAttempt,
		event_sha: eventSha,
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

const parseMode = (value: string): LaneResultMode =>
	value === 'not_applicable' ? 'not_applicable' : 'relevant';

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
		LaneResultMode
	>;
	const reportPath = process.env.CI_NESTED_REPORT_PATH;
	const report = reportPath
		? JSON.parse(await readFile(reportPath, 'utf8'))
		: undefined;
	const lanes = Object.entries(laneSpecs);
	const first = lanes[0];
	if (first === undefined) {
		throw new Error('CI_LANE_SPECS must contain at least one lane');
	}
	const result = createCiLaneResult({
		jobKey,
		lane: first[0],
		expectedSteps: first[1],
		mode:
			explicitModes[first[0]] ??
			parseMode(classifierOutputs[first[0]] ?? 'true'),
		runId,
		runAttempt,
		eventSha,
		stepResults,
		report,
	});
	for (const [laneName, expectedSteps] of lanes.slice(1)) {
		const laneResult = createCiLaneResult({
			jobKey,
			lane: laneName,
			expectedSteps,
			mode:
				explicitModes[laneName] ??
				parseMode(classifierOutputs[laneName] ?? 'true'),
			runId,
			runAttempt,
			eventSha,
			stepResults,
			report,
		});
		result.job.lanes[laneName] = laneResult.job.lanes[laneName];
	}
	result.job.conclusion = Object.values(result.job.lanes).every((lane) =>
		laneSucceeded(lane.mode, lane.steps),
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
