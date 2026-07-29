import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// CLI/job-boundary tests for the bootstrap wrapper around
// scripts/ci-changed-paths.mjs, checked out from the pull request's base
// commit. On the pull request that introduces the classifier (or any branch
// cut before it existed on the base branch), that base-pinned checkout
// legitimately produces nothing. These tests spawn the real
// scripts/ci-run-classifier.mjs entry point — not the classifier's internal
// function — and prove:
//
//   1. classifier ABSENT at the given path -> relevant=true, loudly logged,
//      via a code path that never touches the classifier at all;
//   2. classifier PRESENT -> full delegation, including a real relevant=false
//      verdict, proving the two outcomes are not the same code path (a
//      regression that collapsed them could make "absent" always report
//      the classifier's own answer, or make a present-but-negative
//      classifier get treated as "missing").

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const wrapperScript = path.join(scriptsDirectory, 'ci-run-classifier.mjs');
const classifierScript = path.join(scriptsDirectory, 'ci-changed-paths.mjs');

const runWrapper = (classifierPath, pattern, env = {}) => {
	const fullEnv = { ...process.env, ...env };
	// Never let a real, ambient GITHUB_OUTPUT leak into these tests — only a
	// test that explicitly wants to exercise the append path sets it.
	delete fullEnv.GITHUB_OUTPUT;

	return spawnSync(process.execPath, [wrapperScript, classifierPath, pattern], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: fullEnv,
	});
};

test('BOOTSTRAP: no path given resolves relevant=true and is visible as a missing-classifier state, not a silent default', () => {
	const missingPath = path.join(
		mkdtempSync(path.join(os.tmpdir(), 'publyapp-no-base-classifier-')),
		'scripts',
		'ci-changed-paths.mjs',
	);

	const result = runWrapper(missingPath, '^(apps/front/)');

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^relevant=true/m);
	assert.match(result.stdout, /\[MISSING BASE CLASSIFIER\]/);
	assert.match(result.stdout, /::warning::/);
});

test('BOOTSTRAP: the missing-classifier path never invokes the classifier at all (no gh calls, no PR env needed)', () => {
	// Deliberately do NOT set GH_REPO/PR_NUMBER/GITHUB_EVENT_NAME. If the
	// wrapper's "absent" branch ever fell through to actually running the
	// classifier, ci-changed-paths.mjs would throw on a pull_request event
	// missing those variables and this would fail with a non-zero exit.
	const missingPath = path.join(
		mkdtempSync(path.join(os.tmpdir(), 'publyapp-no-base-classifier-')),
		'ci-changed-paths.mjs',
	);

	const result = spawnSync(
		process.execPath,
		[wrapperScript, missingPath, '^(apps/front/)'],
		{
			cwd: repositoryRoot,
			encoding: 'utf8',
			env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' },
		},
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^relevant=true/m);
});

test('DELEGATION: classifier present and the event is not pull_request — wrapper reports the classifier\'s own relevant=true verdict', () => {
	const result = runWrapper(classifierScript, '^(apps/front/)', {
		GITHUB_EVENT_NAME: 'push',
	});

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /^relevant=true/m);
	// This is the classifier's own reason text, not the wrapper's fallback
	// message — proving genuine delegation, not the wrapper fabricating it.
	assert.match(result.stdout, /path-filtered at the trigger/);
	assert.doesNotMatch(result.stdout, /MISSING BASE CLASSIFIER/);
});

/**
 * Builds a fake `gh` executable on its own PATH directory, exactly as
 * scripts/ci-changed-paths.test.mjs does, so a genuine relevant=false
 * verdict from the real classifier can be proven to pass through the
 * wrapper unchanged.
 */
const buildFakeGh = ({ total = '', files = '' }) => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-fake-gh-'));
	const ghPath = path.join(dir, 'gh');

	writeFileSync(
		ghPath,
		[
			'#!/usr/bin/env node',
			'const args = process.argv.slice(2);',
			"const isFilesCall = args.includes('--paginate');",
			`process.stdout.write(isFilesCall ? ${JSON.stringify(files)} : ${JSON.stringify(total)});`,
			'process.exit(0);',
			'',
		].join('\n'),
	);
	chmodSync(ghPath, 0o755);

	return dir;
};

test("DELEGATION: classifier present and reports relevant=false — the wrapper does NOT override it to true", () => {
	const fakeGhDir = buildFakeGh({ total: '1', files: 'README.md\n' });
	try {
		const result = runWrapper(classifierScript, '^(apps/front/)', {
			PATH: `${fakeGhDir}:${process.env.PATH}`,
			GITHUB_EVENT_NAME: 'pull_request',
			GH_REPO: 'radandevist/publyapp',
			PR_NUMBER: '1',
			GH_TOKEN: 'test-token',
		});

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^relevant=false/);
		assert.doesNotMatch(result.stdout, /MISSING BASE CLASSIFIER/);
	} finally {
		rmSync(fakeGhDir, { recursive: true, force: true });
	}
});

test('usage error: missing arguments exits 1', () => {
	const result = spawnSync(process.execPath, [wrapperScript], {
		cwd: repositoryRoot,
		encoding: 'utf8',
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /Usage: node scripts\/ci-run-classifier\.mjs/);
});
