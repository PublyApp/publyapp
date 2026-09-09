import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { createCiLaneResult, type StepResult } from './ci-lane-result.ts';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const scriptPath = path.join(
	repoRoot,
	'packages/scripts-ts/src/ci-lane-result.ts',
);

const runCollector = (overrides: Record<string, string | undefined>) => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), 'publyapp-ci-lane-result-'));
	try {
		const jobKey = overrides.CI_JOB_KEY ?? 'api';
		const result = spawnSync(process.execPath, [scriptPath], {
			cwd,
			encoding: 'utf8',
			env: {
				...process.env,
				CI_RESULT_DIR: 'ci-results',
				GITHUB_RUN_ID: '42',
				GITHUB_RUN_ATTEMPT: '3',
				GITHUB_SHA: 'event-sha',
				CI_JOB_KEY: 'api',
				CI_LANE_SPECS: JSON.stringify({
					api: ['api.checkout', 'api.suite', 'api.not-applicable'],
				}),
				CI_STEP_RESULTS: JSON.stringify({
					'api.checkout': { outcome: 'success' },
					'api.suite': { outcome: 'skipped' },
					'api.not-applicable': { outcome: 'success' },
				}),
				...overrides,
			},
		});
		const outputPath = path.join(
			cwd,
			`ci-results/${jobKey.replace('/', '-')}.json`,
		);
		const output = result.status === 0 ? readFileSync(outputPath, 'utf8') : '';
		return { ...result, output };
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
};

test('strictly parses classifier false and does not read a missing front report', () => {
	const result = runCollector({
		CI_CLASSIFIER_OUTPUTS: JSON.stringify({ api: 'false' }),
	});

	assert.equal(result.status, 0, result.stderr);
	assert.equal(JSON.parse(result.output).job.lanes.api.mode, 'not_applicable');
});

test('irrelevant front lane does not read a missing nested report', () => {
	const result = runCollector({
		CI_JOB_KEY: 'verification',
		CI_LANE_SPECS: JSON.stringify({
			front: ['verification.front', 'verification.front.not-applicable'],
		}),
		CI_CLASSIFIER_OUTPUTS: JSON.stringify({ front: 'false' }),
		CI_STEP_RESULTS: JSON.stringify({
			'verification.front': { outcome: 'skipped' },
			'verification.front.not-applicable': { outcome: 'success' },
		}),
	});

	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.output);
	assert.equal(output.job.lanes.front.mode, 'not_applicable');
	assert.equal('report' in output.job, false);
});

test('rejects an unknown classifier mode instead of treating it as relevant', () => {
	const result = runCollector({
		CI_CLASSIFIER_OUTPUTS: JSON.stringify({ api: 'maybe' }),
	});

	assert.notEqual(result.status, 0);
	assert.match(
		`${result.stdout}${result.stderr}`,
		/literal true or false|invalid.*mode/i,
	);
});

test('relevant E2E lane accepts skipped failure-only upload and sentinel steps', () => {
	const result = createCiLaneResult({
		jobKey: 'e2e-test/1',
		lane: 'e2e',
		expectedSteps: [
			'e2e-test.playwright',
			'e2e-test.report_upload',
			'e2e-test.teardown',
			'e2e-test.not-applicable',
		],
		mode: 'relevant',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: {
			'e2e-test.playwright': { outcome: 'success' },
			'e2e-test.report_upload': { outcome: 'skipped' },
			'e2e-test.teardown': { outcome: 'success' },
			'e2e-test.not-applicable': { outcome: 'skipped' },
		},
	});

	assert.equal(result.job.conclusion, 'success');
});

const e2eBuildExpectedSteps = [
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
];

const e2eBuildOutcome = (
	id: string,
	login: StepResult['outcome'],
	uploadImages: StepResult['outcome'],
	otherOutcome: StepResult['outcome'],
	sentinelOutcome: StepResult['outcome'],
): StepResult['outcome'] => {
	if (id === 'e2e-build.login') {
		return login;
	}
	if (id === 'e2e-build.upload_images') {
		return uploadImages;
	}
	if (id === 'e2e-build.not-applicable') {
		return sentinelOutcome;
	}
	return otherOutcome;
};

const e2eBuildResults = (
	login: StepResult['outcome'],
	uploadImages: StepResult['outcome'],
	otherOutcome: StepResult['outcome'] = 'success',
	sentinelOutcome: StepResult['outcome'] = 'skipped',
) =>
	Object.fromEntries(
		e2eBuildExpectedSteps.map((id) => [
			id,
			{
				outcome: e2eBuildOutcome(
					id,
					login,
					uploadImages,
					otherOutcome,
					sentinelOutcome,
				),
			},
		]),
	) as Record<string, StepResult>;

const e2eTestExpectedSteps = [
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
];

const e2eTestOutcome = (
	id: string,
	login: StepResult['outcome'],
	pullStack: StepResult['outcome'],
	downloadImages: StepResult['outcome'],
	loadImages: StepResult['outcome'],
	otherOutcome: StepResult['outcome'],
	sentinelOutcome: StepResult['outcome'],
): StepResult['outcome'] => {
	if (id === 'e2e-test.login') {
		return login;
	}
	if (id === 'e2e-test.pull_stack') {
		return pullStack;
	}
	if (id === 'e2e-test.download_images') {
		return downloadImages;
	}
	if (id === 'e2e-test.load_images') {
		return loadImages;
	}
	if (id === 'e2e-test.not-applicable') {
		return sentinelOutcome;
	}
	return otherOutcome;
};

const e2eTestResults = (
	login: StepResult['outcome'],
	pullStack: StepResult['outcome'],
	downloadImages: StepResult['outcome'],
	loadImages: StepResult['outcome'],
	otherOutcome: StepResult['outcome'] = 'success',
	sentinelOutcome: StepResult['outcome'] = 'skipped',
) =>
	Object.fromEntries(
		e2eTestExpectedSteps.map((id) => [
			id,
			{
				outcome: e2eTestOutcome(
					id,
					login,
					pullStack,
					downloadImages,
					loadImages,
					otherOutcome,
					sentinelOutcome,
				),
			},
		]),
	) as Record<string, StepResult>;

const createE2eTestResult = (
	login: StepResult['outcome'],
	pullStack: StepResult['outcome'],
	downloadImages: StepResult['outcome'],
	loadImages: StepResult['outcome'],
	otherOutcome: StepResult['outcome'] = 'success',
	sentinelOutcome: StepResult['outcome'] = 'skipped',
) =>
	createCiLaneResult({
		jobKey: 'e2e-test/1',
		lane: 'e2e',
		expectedSteps: e2eTestExpectedSteps,
		mode: 'relevant',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: e2eTestResults(
			login,
			pullStack,
			downloadImages,
			loadImages,
			otherOutcome,
			sentinelOutcome,
		),
	});

const createE2eBuildResult = (
	login: StepResult['outcome'],
	uploadImages: StepResult['outcome'],
	otherOutcome: StepResult['outcome'] = 'success',
	sentinelOutcome: StepResult['outcome'] = 'skipped',
) =>
	createCiLaneResult({
		jobKey: 'e2e-build',
		lane: 'e2e',
		expectedSteps: e2eBuildExpectedSteps,
		mode: 'relevant',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: e2eBuildResults(
			login,
			uploadImages,
			otherOutcome,
			sentinelOutcome,
		),
	});

test.each([
	['internal GHCR transport', 'success', 'skipped'],
	['fork artifact transport', 'skipped', 'success'],
] as const)('relevant e2e-build accepts %s', (_name, login, uploadImages) => {
	const result = createE2eBuildResult(login, uploadImages);

	assert.equal(result.job.conclusion, 'success');
});

test.each([
	['both transports skipped', 'skipped', 'skipped'],
	['both transports succeeded', 'success', 'success'],
	['login failed', 'failure', 'skipped'],
	['login cancelled', 'cancelled', 'skipped'],
	['upload failed', 'skipped', 'failure'],
	['upload cancelled', 'skipped', 'cancelled'],
] as const)('relevant e2e-build rejects %s', (_name, login, uploadImages) => {
	const result = createE2eBuildResult(login, uploadImages);

	assert.equal(result.job.conclusion, 'failure');
});

test('relevant e2e-build keeps every non-transport step mandatory', () => {
	const result = createE2eBuildResult('success', 'skipped', 'failure');

	assert.equal(result.job.conclusion, 'failure');
});

test('irrelevant e2e-build accepts skipped work and a successful sentinel', () => {
	const result = createCiLaneResult({
		jobKey: 'e2e-build',
		lane: 'e2e',
		expectedSteps: e2eBuildExpectedSteps,
		mode: 'not_applicable',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: e2eBuildResults('skipped', 'skipped', 'skipped', 'success'),
	});

	assert.equal(result.job.conclusion, 'success');
});

test('irrelevant e2e-build rejects executed work even with a successful sentinel', () => {
	const stepResults = e2eBuildResults(
		'skipped',
		'skipped',
		'skipped',
		'success',
	);
	stepResults['e2e-build.images'] = { outcome: 'success' };
	const result = createCiLaneResult({
		jobKey: 'e2e-build',
		lane: 'e2e',
		expectedSteps: e2eBuildExpectedSteps,
		mode: 'not_applicable',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults,
	});

	assert.equal(result.job.conclusion, 'failure');
});

test('e2e-build missing transport outcome throws before evaluation', () => {
	const stepResults = e2eBuildResults('success', 'skipped');
	delete stepResults['e2e-build.upload_images'];

	assert.throws(
		() =>
			createCiLaneResult({
				jobKey: 'e2e-build',
				lane: 'e2e',
				expectedSteps: e2eBuildExpectedSteps,
				mode: 'relevant',
				runId: 42,
				runAttempt: 3,
				eventSha: 'event-sha',
				stepResults,
			}),
		/missing workflow outcome for e2e-build\.upload_images/,
	);
});

test.each([
	[
		'all transports succeeded',
		'success',
		'success',
		'success',
		'success',
		false,
	],
	[
		'internal succeeded and download succeeded',
		'success',
		'success',
		'success',
		'skipped',
		false,
	],
	[
		'internal succeeded and load succeeded',
		'success',
		'success',
		'skipped',
		'success',
		false,
	],
	['internal GHCR transport', 'success', 'success', 'skipped', 'skipped', true],
	[
		'login succeeded and both fork steps succeeded',
		'success',
		'skipped',
		'success',
		'success',
		false,
	],
	[
		'login succeeded and pull skipped',
		'success',
		'skipped',
		'skipped',
		'success',
		false,
	],
	['login only succeeded', 'success', 'skipped', 'skipped', 'skipped', false],
	[
		'pull succeeded and both fork steps succeeded',
		'skipped',
		'success',
		'success',
		'success',
		false,
	],
	[
		'pull and download succeeded',
		'skipped',
		'success',
		'success',
		'skipped',
		false,
	],
	[
		'crossed partial transport B',
		'skipped',
		'success',
		'skipped',
		'success',
		false,
	],
	['pull only succeeded', 'skipped', 'success', 'skipped', 'skipped', false],
	[
		'both internal steps skipped and download succeeded',
		'skipped',
		'skipped',
		'success',
		'skipped',
		false,
	],
	['fork artifact transport', 'skipped', 'skipped', 'success', 'success', true],
	[
		'both internal steps skipped and load succeeded',
		'skipped',
		'skipped',
		'skipped',
		'success',
		false,
	],
	['all transports skipped', 'skipped', 'skipped', 'skipped', 'skipped', false],
	[
		'crossed partial transport A',
		'success',
		'skipped',
		'success',
		'skipped',
		false,
	],
] as const)(
	'relevant e2e-test profile %s',
	(_name, login, pullStack, downloadImages, loadImages, expectSuccess) => {
		const result = createE2eTestResult(
			login,
			pullStack,
			downloadImages,
			loadImages,
		);

		assert.equal(result.job.conclusion === 'success', expectSuccess);
	},
);

test.each([
	['login failed', 'failure', 'success', 'skipped', 'skipped'],
	['login cancelled', 'cancelled', 'success', 'skipped', 'skipped'],
	['pull failed', 'success', 'failure', 'skipped', 'skipped'],
	['pull cancelled', 'success', 'cancelled', 'skipped', 'skipped'],
	['download failed', 'skipped', 'skipped', 'failure', 'success'],
	['download cancelled', 'skipped', 'skipped', 'cancelled', 'success'],
	['load failed', 'skipped', 'skipped', 'success', 'failure'],
	['load cancelled', 'skipped', 'skipped', 'success', 'cancelled'],
] as const)(
	'relevant e2e-test rejects %s',
	(_name, login, pullStack, downloadImages, loadImages) => {
		const result = createE2eTestResult(
			login,
			pullStack,
			downloadImages,
			loadImages,
		);

		assert.equal(result.job.conclusion, 'failure');
	},
);

test('relevant e2e-test keeps every non-transport step mandatory', () => {
	const result = createE2eTestResult(
		'success',
		'success',
		'skipped',
		'skipped',
		'failure',
	);

	assert.equal(result.job.conclusion, 'failure');
});

test('irrelevant e2e-test accepts skipped work and a successful sentinel', () => {
	const result = createCiLaneResult({
		jobKey: 'e2e-test/1',
		lane: 'e2e',
		expectedSteps: e2eTestExpectedSteps,
		mode: 'not_applicable',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: e2eTestResults(
			'skipped',
			'skipped',
			'skipped',
			'skipped',
			'skipped',
			'success',
		),
	});

	assert.equal(result.job.conclusion, 'success');
});

test('irrelevant e2e-test rejects executed work even with a successful sentinel', () => {
	const result = createCiLaneResult({
		jobKey: 'e2e-test/1',
		lane: 'e2e',
		expectedSteps: e2eTestExpectedSteps,
		mode: 'not_applicable',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: e2eTestResults(
			'success',
			'skipped',
			'skipped',
			'skipped',
			'skipped',
			'success',
		),
	});

	assert.equal(result.job.conclusion, 'failure');
});

test('e2e-test transport requires the complete exact expected-ID set', () => {
	const expectedSteps = [
		'e2e-test.login',
		'e2e-test.pull_stack',
		'e2e-test.not-applicable',
	];
	const result = createCiLaneResult({
		jobKey: 'e2e-test/1',
		lane: 'e2e',
		expectedSteps,
		mode: 'relevant',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: {
			'e2e-test.login': { outcome: 'success' },
			'e2e-test.pull_stack': { outcome: 'skipped' },
			'e2e-test.not-applicable': { outcome: 'skipped' },
		},
	});

	assert.equal(result.job.conclusion, 'failure');
});

test('lookalike transport IDs do not inherit e2e-test optionality', () => {
	const expectedSteps = [
		'other-e2e-test.login',
		'other-e2e-test.pull_stack',
		'other-e2e-test.download_images',
		'other-e2e-test.load_images',
		'other-e2e-test.not-applicable',
	];
	const result = createCiLaneResult({
		jobKey: 'other-e2e-test',
		lane: 'e2e',
		expectedSteps,
		mode: 'relevant',
		runId: 42,
		runAttempt: 3,
		eventSha: 'event-sha',
		stepResults: Object.fromEntries(
			expectedSteps.map((id) => [
				id,
				{ outcome: id.endsWith('.not-applicable') ? 'skipped' : 'success' },
			]),
		) as Record<string, StepResult>,
	});

	assert.equal(result.job.conclusion, 'success');
});

test('e2e-test missing transport outcome throws before evaluation', () => {
	const stepResults = e2eTestResults(
		'success',
		'success',
		'skipped',
		'skipped',
	);
	delete stepResults['e2e-test.load_images'];

	assert.throws(
		() =>
			createCiLaneResult({
				jobKey: 'e2e-test/1',
				lane: 'e2e',
				expectedSteps: e2eTestExpectedSteps,
				mode: 'relevant',
				runId: 42,
				runAttempt: 3,
				eventSha: 'event-sha',
				stepResults,
			}),
		/missing workflow outcome for e2e-test\.load_images/,
	);
});
