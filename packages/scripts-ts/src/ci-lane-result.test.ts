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
	const result = createE2eBuildResult(
		'success',
		'skipped',
		'success',
		'success',
	);

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
