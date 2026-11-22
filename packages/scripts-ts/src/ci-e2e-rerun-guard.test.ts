import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

// Proves the #1063 stale-image guard: central CI's `e2e-test`/`e2e-smoke` jobs
// must detect — BEFORE they pull anything — that the image tag they were handed
// does not address the tree this job checked out. The tag is now the git tree
// hash, so the check is exact content identity: a tag from another commit, or a
// hand-set tag, can never pass. The old "cleanup deleted them" failure mode is
// gone (tree tags are retained for merge-queue reuse), so the tree check is what
// keeps the pull honest.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);

const workflowPath = path.join(repoRoot, '.github/workflows/ci.yml');
const GUARD_STEP_NAME = 'Detect partial rerun';
const PULL_STEP_NAME = 'Pull stack images';
const TAG_STEP_NAME = 'Resolve image tag';
const GUARD_SCRIPT = 'node packages/scripts-ts/src/ci-e2e-rerun-guard.ts';

const document = parse(readFileSync(workflowPath, 'utf8')) as {
	jobs: Record<string, { steps: { name?: string; run?: string }[] }>;
};

const extract = (jobId: string, name: string) => {
	const steps = document.jobs[jobId]?.steps ?? [];
	const index = steps.findIndex((step) => step.name === name);
	assert.notEqual(index, -1, `ci.yml: ${jobId} has no step named "${name}"`);
	return { step: steps[index], index, steps };
};

test('the guard runs before the pull in both stack jobs', () => {
	for (const jobId of ['e2e-test', 'e2e-smoke']) {
		const guard = extract(jobId, GUARD_STEP_NAME);
		const pull = extract(jobId, PULL_STEP_NAME);
		assert.equal(guard.step.run?.trim(), GUARD_SCRIPT);
		assert.ok(
			guard.index < pull.index,
			`${jobId}: the stale-image guard must run before the pull`,
		);
	}
});

test('the image tag is the checked-out git tree, not a run attempt', () => {
	const tag = extract('e2e-build', TAG_STEP_NAME);
	assert.match(tag.step.run ?? '', /git rev-parse HEAD\^\{tree\}/);
	assert.match(tag.step.run ?? '', /tag=tree-/);
});

const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
	cwd: repoRoot,
	encoding: 'utf8',
}).trim();

const guardScript = path.join(
	repoRoot,
	GUARD_SCRIPT.replace('node ', '').trim(),
);

const runGuard = (tag: string) =>
	spawnSync(process.execPath, [guardScript], {
		encoding: 'utf8',
		env: { ...process.env, E2E_IMAGE_TAG: tag },
	});

test('the checked-out tree passes silently', () => {
	const result = runGuard(`tree-${tree}`);
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.equal(result.stdout, '');
});

test('a tag from another commit fails loudly before any pull', () => {
	const result = runGuard(`tree-${'0'.repeat(40)}`);
	assert.equal(result.status, 1);
	assert.match(result.stdout, /::error::/);
	assert.match(result.stdout, /rerun all jobs/i);
});

test('a missing tag fails closed', () => {
	const result = runGuard('');
	assert.equal(result.status, 1);
	assert.match(result.stdout, /::error::/);
});
