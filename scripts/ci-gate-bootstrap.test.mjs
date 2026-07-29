import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

// Proves the #1017 bootstrap fallback — "the base-pinned classifier
// (scripts/ci-changed-paths.mjs, checked out from the pull request's base
// commit) legitimately does not exist for the pull request that introduces
// it, or a branch cut before it existed on the base branch" — actually
// works, by extracting the REAL inline `run:` script from each `changes`
// job's classifier-invocation step (parsed from the real workflow YAML, not
// a hand-copied restatement) and executing it directly, exactly as GitHub
// Actions would: `bash -e` (GitHub's default, unspecified-shell behavior for
// a `run:` step; note this is `-e` only, NOT `-o pipefail`, unless `shell:
// bash` is declared explicitly — it is not, here).
//
// The inline fallback intentionally keeps two outcomes on separate code
// paths (see the workflow comments): classifier ABSENT -> relevant=true,
// loudly logged, without ever invoking the classifier; classifier PRESENT ->
// delegated to entirely, its own exit code and output passed through
// unchanged. Both are exercised here, against every one of the four
// aggregate-gate workflows.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
const realClassifierPath = path.join(repoRoot, 'scripts/ci-changed-paths.mjs');

const workflowFiles = [
	'front-e2e.yml',
	'front-ci.yml',
	'openapi-spec-drift.yml',
	'docs-archive.yml',
];

/**
 * Parses a real workflow file and returns the `run:` body of the `changes`
 * job's classifier-invocation step (identified by `id: filter`, the same id
 * scripts/check-ci-gate-structure.mjs pins).
 */
const extractFilterStepRun = (file) => {
	const document = parse(
		readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8'),
	);
	const step = document.jobs.changes.steps.find((s) => s.id === 'filter');

	assert.ok(step, `${file}: expected a step with id: filter in the changes job`);
	assert.equal(typeof step.run, 'string', `${file}: expected step.run to be a string`);

	return step.run;
};

/**
 * Executes `script` exactly as GitHub Actions would for an unspecified-shell
 * `run:` step (`bash -e -c`), in `cwd`, with GITHUB_OUTPUT pointed at a real
 * temp file so `>> "$GITHUB_OUTPUT"` writes land somewhere readable.
 */
const runInline = (script, cwd, env = {}) => {
	const githubOutputPath = path.join(cwd, 'github-output.txt');
	writeFileSync(githubOutputPath, '');

	const stdout = execFileSync('bash', ['-e', '-c', script], {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, ...env, GITHUB_OUTPUT: githubOutputPath },
	});

	return { stdout, output: readFileSync(githubOutputPath, 'utf8') };
};

for (const file of workflowFiles) {
	test(`${file}: BOOTSTRAP — classifier absent at base-ref/ resolves to relevant=true, loudly, without invoking it`, () => {
		const script = extractFilterStepRun(file);
		const cwd = mkdtempSync(path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'));

		try {
			// Deliberately do NOT create base-ref/ at all, and do NOT set
			// GH_REPO/PR_NUMBER/GITHUB_EVENT_NAME — if the fallback branch ever
			// fell through to actually invoking the classifier, a pull_request
			// run missing those would throw, and this would fail non-zero.
			const { stdout, output } = runInline(script, cwd);

			assert.match(stdout, /\[MISSING BASE CLASSIFIER\]/);
			assert.match(stdout, /::warning::/);
			assert.match(output, /^relevant=true$/m);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test(`${file}: DELEGATION — classifier present at base-ref/ is invoked, its own answer passed through unchanged`, () => {
		const script = extractFilterStepRun(file);
		const cwd = mkdtempSync(path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'));

		try {
			mkdirSync(path.join(cwd, 'base-ref/scripts'), { recursive: true });
			copyFileSync(
				realClassifierPath,
				path.join(cwd, 'base-ref/scripts/ci-changed-paths.mjs'),
			);

			// A push event lets the real classifier answer deterministically
			// (relevant=true, unconditionally) without needing a stubbed `gh`.
			const { stdout, output } = runInline(script, cwd, {
				GITHUB_EVENT_NAME: 'push',
			});

			assert.doesNotMatch(stdout, /MISSING BASE CLASSIFIER/);
			// This is the classifier's OWN reason text (see
			// scripts/ci-changed-paths.mjs), not the fallback's message —
			// proving genuine delegation, not the inline script fabricating it.
			assert.match(stdout, /path-filtered at the trigger/);
			assert.match(output, /^relevant=true$/m);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
}
