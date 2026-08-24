import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

// Proves the #1063 partial-re-run guard: front-e2e's `test` job must detect —
// BEFORE it pulls the stack images — that it is running as a partial re-run
// of failed jobs, and fail loudly telling the user a full workflow re-run is
// required. It must NOT fix the underlying problem by switching to a stable
// tag (a re-run would silently test the OLD build) or by retaining the
// per-run scratch images (the cleanup job deletes them, which is correct).
//
// Why this can never work: the e2e image tag is ${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}
// and the `cleanup` job runs with `if: always()`, so it deletes the images
// even when the shards fail. "Re-run failed jobs" re-runs only the failed
// `test` job — the `build` job is not re-run, so `needs.build.outputs.tag`
// still holds the PREVIOUS attempt's tag, whose images are already deleted.
// The pull then fails with "manifest unknown", indistinguishable from a
// registry problem. Observed on PR #1056.
//
// The guard detects exactly that: the tag the build job emitted for this
// attempt must be the current attempt's tag. On a fresh run and on a FULL
// workflow re-run ("Re-run all jobs", which re-runs `build`), the build job
// re-pushes `${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}` and the comparison
// holds. On a partial re-run the build job is not re-run, the tag is stale,
// and the guard fails the job before any pull attempt with an explicit
// message.
//
// Like ci-gate-bootstrap.test.mjs / ci-gate-aggregation.test.mjs, the REAL
// `run:` body is extracted from the real workflow YAML (parsed, not
// hand-copied) and executed via `bash -e` (GitHub's default
// unspecified-shell behavior for a `run:` step), with the environment set
// the way an actual run would see it. The guard references only plain
// environment variables, so no GitHub-expression substitution is needed.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const workflowPath = path.join(repoRoot, '.github/workflows/front-e2e.yml');

const GUARD_STEP_NAME = 'Detect partial re-run before pull';
const PULL_STEP_NAME = 'Pull stack';
const TAG_STEP_NAME = 'Set image tag';

/**
 * Parses the real front-e2e.yml and returns the pinned facts the guard tests
 * assert against: the guard step's `run:` body, the step index of the guard
 * relative to the pull step, and the build job's tag derivation step.
 * Extraction is by exact pinned names, so removing, renaming, or relocating
 * the guard (or abandoning the per-run tag scheme) fails these tests even if
 * the remaining assertions never get a chance to run.
 */
const extractGuard = () => {
	const document = parse(readFileSync(workflowPath, 'utf8'));
	const testSteps = document.jobs.test.steps;

	assert.ok(
		Array.isArray(testSteps),
		'front-e2e.yml: expected a "test" job with a steps array',
	);

	const guardIndex = testSteps.findIndex(
		(step) => step?.name === GUARD_STEP_NAME,
	);

	assert.ok(
		guardIndex !== -1,
		`front-e2e.yml: expected the test job to contain a step named "${GUARD_STEP_NAME}" — the #1063 partial-re-run guard is missing.`,
	);

	const guardStep = testSteps[guardIndex];

	assert.equal(
		typeof guardStep.run,
		'string',
		`front-e2e.yml::test::${GUARD_STEP_NAME}: expected step.run to be a string`,
	);

	assert.ok(
		guardStep['continue-on-error'] === undefined,
		`front-e2e.yml::test::${GUARD_STEP_NAME}: must not set continue-on-error — that would let the guard fail while the job (and the required gate) still reports success.`,
	);

	const pullIndex = testSteps.findIndex(
		(step) => step?.name === PULL_STEP_NAME,
	);

	assert.ok(
		pullIndex !== -1,
		`front-e2e.yml: expected the test job to contain a step named "${PULL_STEP_NAME}"`,
	);

	assert.ok(
		guardIndex < pullIndex,
		`front-e2e.yml::test: "${GUARD_STEP_NAME}" must run BEFORE "${PULL_STEP_NAME}" — detection before the pull is the whole point; a guard that runs after the pull attempt has already started does not save the next person the "manifest unknown" misdiagnosis.`,
	);

	const buildSteps = document.jobs.build.steps;
	// @ts-expect-error rung-0: add proper type in later rung
	const tagStep = buildSteps.find((step) => step?.name === TAG_STEP_NAME);

	assert.ok(
		tagStep,
		'front-e2e.yml: expected the build job to contain a step named "Set image tag"',
	);

	assert.equal(
		typeof tagStep.run,
		'string',
		'front-e2e.yml::build::Set image tag: expected step.run to be a string',
	);

	return { guardRun: guardStep.run, tagRun: tagStep.run };
};

const { guardRun, tagRun } = extractGuard();

/**
 * Executes the guard's real `run:` body exactly as GitHub Actions would for
 * an unspecified-shell step (`bash -e -c`), with the environment a real run
 * would see for the given scenario. `spawnSync` so a nonzero exit is data,
 * not a thrown exception.
 */
// @ts-expect-error rung-0: add proper type in later rung
const runGuard = (env) =>
	spawnSync('bash', ['-e', '-c', guardRun], {
		encoding: 'utf8',
		env: { ...process.env, ...env },
	});

// ---------------------------------------------------------------------------
// The tag scheme itself: #1063's scope explicitly forbids "fixing" this by
// making the tag stable across attempts (a partial re-run would then silently
// test the OLD build) or by retaining the scratch images. The build job must
// keep deriving the tag from BOTH the run id and the attempt number — the
// property that makes the guard's staleness comparison meaningful.
// ---------------------------------------------------------------------------

test('the build job still derives the image tag from run id AND attempt (per-run scratch, not a stable tag)', () => {
	assert.match(tagRun, /\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/);
	assert.match(tagRun, /GITHUB_RUN_ATTEMPT/);
	assert.match(tagRun, /GITHUB_RUN_ID/);
});

// ---------------------------------------------------------------------------
// Behavior, executed against the REAL extracted run body: fresh run, full
// re-run, and the #1063 partial re-run (the mutation-observable cases — a
// no-op guard, or one that only prints but does not exit nonzero, fails the
// partial-rerun assertion below; a guard that fires on fresh runs fails the
// first two).
// ---------------------------------------------------------------------------

const RUN_ID = '12345678';

test('a fresh run (attempt 1, tag matches) passes', () => {
	const { status, stdout, stderr } = runGuard({
		E2E_IMAGE_TAG: `${RUN_ID}-1`,
		GITHUB_RUN_ID: RUN_ID,
		GITHUB_RUN_ATTEMPT: '1',
	});

	assert.equal(
		status,
		0,
		`fresh run must pass; stdout: ${stdout}; stderr: ${stderr}`,
	);
	assert.equal(stdout, '', `fresh run must be silent; stdout: ${stdout}`);
});

test('a FULL workflow re-run (attempt 2, build re-ran and re-pushed its tag) passes', () => {
	const { status, stdout, stderr } = runGuard({
		E2E_IMAGE_TAG: `${RUN_ID}-2`,
		GITHUB_RUN_ID: RUN_ID,
		GITHUB_RUN_ATTEMPT: '2',
	});

	assert.equal(
		status,
		0,
		`full re-run must pass; stdout: ${stdout}; stderr: ${stderr}`,
	);
	assert.equal(stdout, '', `full re-run must be silent; stdout: ${stdout}`);
});

test('a PARTIAL re-run of failed jobs (attempt 2, stale tag from attempt 1) fails loudly with a full-workflow-rerun message', () => {
	const { status, stdout } = runGuard({
		E2E_IMAGE_TAG: `${RUN_ID}-1`,
		GITHUB_RUN_ID: RUN_ID,
		GITHUB_RUN_ATTEMPT: '2',
	});

	assert.equal(
		status,
		1,
		`partial re-run must fail the step before any pull; stdout: ${stdout}`,
	);
	assert.match(stdout, /::error::/);
	assert.match(
		stdout,
		/full workflow re-run/i,
		`the error message must tell the user a full workflow re-run is required; stdout: ${stdout}`,
	);
	assert.match(
		stdout,
		/Re-run all jobs/,
		`the error message must name the working retry ("Re-run all jobs"); stdout: ${stdout}`,
	);
});

test('a missing/empty build tag fails closed (nothing to pull can never pass)', () => {
	const { status, stdout } = runGuard({
		E2E_IMAGE_TAG: '',
		GITHUB_RUN_ID: RUN_ID,
		GITHUB_RUN_ATTEMPT: '1',
	});

	assert.equal(status, 1, `empty tag must fail; stdout: ${stdout}`);
	assert.match(stdout, /::error::/);
});
