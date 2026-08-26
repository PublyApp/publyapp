import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

import { classifyRelevance } from './ci-changed-paths.ts';

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
// unchanged.
//
// Round 3 found the "passed through unchanged" claim too weak: the only
// present/delegation case exercised `push`, and the assertion was a positive
// substring regex, not exact equality. A mutation that delegated only on
// `push` and hardcoded `relevant=false` otherwise passed all 8 tests. These
// now assert EXACT GITHUB_OUTPUT (and, where feasible, exact stdout)
// equality, and cover: a controlled stub classifier answering both true and
// false, a stub classifier that exits nonzero (proving the failure
// propagates rather than being silently swallowed or reinterpreted as
// "missing"), and the real classifier under a genuine pull_request event
// with both a matching and a non-matching file list.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const realClassifierPath = path.join(
	repoRoot,
	'packages/scripts-ts/src/ci-changed-paths.ts',
);

const workflowFiles = [
	'front-e2e.yml',
	'front-ci.yml',
	'openapi-spec-drift.yml',
	'docs-archive.yml',
	'react-doctor.yml',
	// #1462: CI runs the full API test suite behind this gate; its classifier
	// invocation gets the same present/absent fallback fixtures as the rest.
	'api-tests.yml',
];

/**
 * Parses a real workflow file and returns the `run:` body of the `changes`
 * job's classifier-invocation step (identified by `id: filter`, the same id
 * scripts/check-ci-gate-structure.mjs pins).
 */
// @ts-expect-error rung-0: add proper type in later rung
const extractFilterStepRun = (file) => {
	const document = parse(
		readFileSync(path.join(repoRoot, '.github/workflows', file), 'utf8'),
	);
	// @ts-expect-error rung-0: add proper type in later rung
	const step = document.jobs.changes.steps.find((s) => s.id === 'filter');

	assert.ok(
		step,
		`${file}: expected a step with id: filter in the changes job`,
	);
	assert.equal(
		typeof step.run,
		'string',
		`${file}: expected step.run to be a string`,
	);

	return step.run;
};

/**
 * Executes `script` exactly as GitHub Actions would for an unspecified-shell
 * `run:` step (`bash -e -c`), in `cwd`, with GITHUB_OUTPUT pointed at a real
 * temp file so `>> "$GITHUB_OUTPUT"` writes land somewhere readable.
 * `spawnSync` (not `execFileSync`) so a nonzero exit is data, not a thrown
 * exception — the nonzero-propagation test below needs to observe it.
 */
// @ts-expect-error rung-0: add proper type in later rung
const runInline = (script, cwd, env = {}) => {
	const githubOutputPath = path.join(cwd, 'github-output.txt');
	writeFileSync(githubOutputPath, '');

	const result = spawnSync('bash', ['-e', '-c', script], {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, ...env, GITHUB_OUTPUT: githubOutputPath },
	});

	return { ...result, output: readFileSync(githubOutputPath, 'utf8') };
};

for (const file of workflowFiles) {
	test(`${file}: BOOTSTRAP — classifier absent at base-ref/ resolves to exactly relevant=true, loudly, without invoking it`, () => {
		const script = extractFilterStepRun(file);
		const cwd = mkdtempSync(
			path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'),
		);

		try {
			// Deliberately do NOT create base-ref/ at all, and do NOT set
			// GH_REPO/PR_NUMBER/GITHUB_EVENT_NAME — if the fallback branch ever
			// fell through to actually invoking the classifier, a pull_request
			// run missing those would throw, and this would fail non-zero.
			const { status, stdout, output } = runInline(script, cwd);

			assert.equal(status, 0, stdout);
			assert.match(stdout, /\[MISSING BASE CLASSIFIER\]/);
			assert.match(stdout, /::warning::/);
			assert.equal(output, 'relevant=true\n');
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
}

// ---------------------------------------------------------------------------
// DELEGATION via a controlled stub classifier: proves the inline script's
// "present" branch is pure pass-through — not "run it and hope", but exact
// stdout and GITHUB_OUTPUT equality, plus a genuinely broken classifier's
// nonzero exit propagating rather than being swallowed or turned into the
// fallback's relevant=true.
// ---------------------------------------------------------------------------

/**
 * Writes a stub classifier at base-ref/scripts/ci-changed-paths.mjs that
 * prints `marker` to stdout, optionally appends `relevant=<value>` to
 * GITHUB_OUTPUT, and exits with `exitCode`. Standing in for the real
 * classifier so the pass-through property can be proven independent of
 * scripts/ci-changed-paths.mjs's own internal logic.
 */
// @ts-expect-error rung-0: add proper type in later rung
const writeStubClassifier = (cwd, { marker, relevant, exitCode }) => {
	const dir = path.join(cwd, 'base-ref/packages/scripts-ts/src');
	mkdirSync(dir, { recursive: true });
	const stubPath = path.join(dir, 'ci-changed-paths.ts');

	const lines = [
		"import { appendFileSync } from 'node:fs';",
		"import process from 'node:process';",
		`process.stdout.write(${JSON.stringify(marker)} + '\\n');`,
	];

	if (relevant !== undefined) {
		lines.push(
			'const githubOutput = process.env.GITHUB_OUTPUT;',
			'if (githubOutput) {',
			`  appendFileSync(githubOutput, 'relevant=${relevant}\\n');`,
			'}',
		);
	}

	lines.push(`process.exit(${exitCode});`);

	writeFileSync(stubPath, lines.join('\n'));
	chmodSync(stubPath, 0o755);
};

for (const file of workflowFiles) {
	test(`${file}: DELEGATION — a stub classifier answering relevant=true passes through verbatim (exact stdout + exact GITHUB_OUTPUT)`, () => {
		const script = extractFilterStepRun(file);
		const cwd = mkdtempSync(
			path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'),
		);

		try {
			writeStubClassifier(cwd, {
				marker: 'STUB-CLASSIFIER-SAYS-TRUE',
				relevant: 'true',
				exitCode: 0,
			});

			const { status, stdout, output } = runInline(script, cwd, {
				GITHUB_EVENT_NAME: 'push',
			});

			assert.equal(status, 0);
			assert.equal(stdout, 'STUB-CLASSIFIER-SAYS-TRUE\n');
			assert.equal(output, 'relevant=true\n');
			assert.doesNotMatch(stdout, /MISSING BASE CLASSIFIER/);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test(`${file}: DELEGATION — a stub classifier answering relevant=false is NOT overridden to true`, () => {
		const script = extractFilterStepRun(file);
		const cwd = mkdtempSync(
			path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'),
		);

		try {
			writeStubClassifier(cwd, {
				marker: 'STUB-CLASSIFIER-SAYS-FALSE',
				relevant: 'false',
				exitCode: 0,
			});

			const { status, stdout, output } = runInline(script, cwd, {
				GITHUB_EVENT_NAME: 'push',
			});

			assert.equal(status, 0);
			assert.equal(stdout, 'STUB-CLASSIFIER-SAYS-FALSE\n');
			assert.equal(output, 'relevant=false\n');
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test(`${file}: DELEGATION — a classifier that exits nonzero propagates the failure instead of falling back to relevant=true`, () => {
		const script = extractFilterStepRun(file);
		const cwd = mkdtempSync(
			path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'),
		);

		try {
			// No GITHUB_OUTPUT write at all — a genuinely broken classifier
			// (crash, thrown exception, `gh` failure) would not have gotten
			// that far either.
			// @ts-expect-error rung-0: TS2741
			writeStubClassifier(cwd, {
				marker: 'STUB-CLASSIFIER-CRASHED',
				exitCode: 17,
			});

			const { status, stdout, output } = runInline(script, cwd, {
				GITHUB_EVENT_NAME: 'push',
			});

			assert.equal(status, 17);
			assert.equal(stdout, 'STUB-CLASSIFIER-CRASHED\n');
			assert.equal(output, '');
			assert.doesNotMatch(stdout, /MISSING BASE CLASSIFIER/);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
}

// ---------------------------------------------------------------------------
// DELEGATION via the REAL classifier under a genuine pull_request event
// (stubbed `gh`, mirroring scripts/ci-changed-paths.test.mjs): proves actual
// end-to-end integration, not just the stub protocol above, for both a true
// and a false verdict — the exact gap round 3 found (the only prior
// "present" case was `push`, whose answer is always true by construction).
// ---------------------------------------------------------------------------

// @ts-expect-error rung-0: add proper type in later rung
const buildFakeGh = ({ total, files }) => {
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

/**
 * Extracts the literal single-quoted pattern argument the real invocation
 * line passes to the classifier (`node "$CLASSIFIER" '<pattern>'`) — each
 * workflow has its own distinct path-group regex, so this must come from
 * the real script, not a guessed constant, or the "expected" computation
 * below would silently test the wrong pattern for three of the four files.
 */
// @ts-expect-error rung-0: add proper type in later rung
const extractPattern = (script) => {
	const match = script.match(/node "\$CLASSIFIER" '([^']*)'/);
	assert.ok(
		match,
		'expected to find the node "$CLASSIFIER" \'<pattern>\' invocation line',
	);
	return match[1];
};

/** One file per workflow that its own real pattern actually matches. */
const RELEVANT_FILE_BY_WORKFLOW = {
	'front-e2e.yml': 'apps/front/src/routes.ts',
	'front-ci.yml': 'apps/front/src/routes.ts',
	'openapi-spec-drift.yml': 'apps/api/Program.cs',
	'docs-archive.yml': 'docs/guides/foo.md',
	'react-doctor.yml': 'apps/front/src/routes.ts',
	// #1462: the suite gate's own file must select itself, like every gate.
	'api-tests.yml': '.github/workflows/api-tests.yml',
};

// A file no workflow's pattern matches, to prove the negative case for all five.
const IRRELEVANT_FILE = 'totally-unrelated-file.txt';

for (const file of workflowFiles) {
	test(`${file}: DELEGATION — real classifier, real pull_request event, matching file: exact relevant=true`, () => {
		const script = extractFilterStepRun(file);
		const pattern = extractPattern(script);
		// @ts-expect-error rung-0: TS7053
		const relevantFile = RELEVANT_FILE_BY_WORKFLOW[file];
		const cwd = mkdtempSync(
			path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'),
		);
		const fakeGhDir = buildFakeGh({ total: '1\n', files: `${relevantFile}\n` });

		try {
			mkdirSync(path.join(cwd, 'base-ref/packages/scripts-ts/src'), {
				recursive: true,
			});
			copyFileSync(
				realClassifierPath,
				path.join(cwd, 'base-ref/packages/scripts-ts/src/ci-changed-paths.ts'),
			);

			const expected = classifyRelevance({
				eventName: 'pull_request',
				files: [relevantFile],
				changedFilesTotal: 1,
				pattern,
			});
			assert.equal(
				expected.relevant,
				true,
				`test fixture error: ${relevantFile} does not match ${file}'s own pattern ${pattern}`,
			);

			const { status, stdout, output } = runInline(script, cwd, {
				GITHUB_EVENT_NAME: 'pull_request',
				GH_REPO: 'PublyApp/publyapp',
				PR_NUMBER: '1',
				GH_TOKEN: 'test-token',
				PATH: `${fakeGhDir}:${process.env.PATH}`,
			});

			assert.equal(status, 0, stdout);
			assert.equal(
				stdout,
				`relevant=${expected.relevant} (${expected.reason})\n`,
			);
			assert.equal(output, 'relevant=true\n');
		} finally {
			rmSync(cwd, { recursive: true, force: true });
			rmSync(fakeGhDir, { recursive: true, force: true });
		}
	});

	test(`${file}: DELEGATION — real classifier, real pull_request event, no matching file: exact relevant=false`, () => {
		const script = extractFilterStepRun(file);
		const pattern = extractPattern(script);
		const cwd = mkdtempSync(
			path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'),
		);
		const fakeGhDir = buildFakeGh({
			total: '1\n',
			files: `${IRRELEVANT_FILE}\n`,
		});

		try {
			mkdirSync(path.join(cwd, 'base-ref/packages/scripts-ts/src'), {
				recursive: true,
			});
			copyFileSync(
				realClassifierPath,
				path.join(cwd, 'base-ref/packages/scripts-ts/src/ci-changed-paths.ts'),
			);

			const expected = classifyRelevance({
				eventName: 'pull_request',
				files: [IRRELEVANT_FILE],
				changedFilesTotal: 1,
				pattern,
			});
			assert.equal(
				expected.relevant,
				false,
				`test fixture error: ${IRRELEVANT_FILE} unexpectedly matches ${file}'s own pattern ${pattern}`,
			);

			const { status, stdout, output } = runInline(script, cwd, {
				GITHUB_EVENT_NAME: 'pull_request',
				GH_REPO: 'PublyApp/publyapp',
				PR_NUMBER: '1',
				GH_TOKEN: 'test-token',
				PATH: `${fakeGhDir}:${process.env.PATH}`,
			});

			assert.equal(status, 0, stdout);
			assert.equal(
				stdout,
				`relevant=${expected.relevant} (${expected.reason})\n`,
			);
			assert.equal(output, 'relevant=false\n');
		} finally {
			rmSync(cwd, { recursive: true, force: true });
			rmSync(fakeGhDir, { recursive: true, force: true });
		}
	});
}

// ---------------------------------------------------------------------------
// ROUND 4: DELEGATION via the REAL classifier under a genuine merge_group
// event. #1017 adds `merge_group:` to all four workflows so their required
// checks can report for a merge-queue entry; there is no pull-request file
// list to evaluate one against, so the classifier must resolve relevant=true
// unconditionally for this event, WITHOUT invoking any `gh` call at all (no
// fake `gh` binary is put on PATH here — if the "present" branch ever
// regressed to routing merge_group through the pull_request file-list path,
// this would fail with a `gh: command not found`, not silently produce the
// right answer for the wrong reason).
// ---------------------------------------------------------------------------

for (const file of workflowFiles) {
	test(`${file}: DELEGATION — real classifier, genuine merge_group event: relevant=true without invoking gh`, () => {
		const script = extractFilterStepRun(file);
		const cwd = mkdtempSync(
			path.join(os.tmpdir(), 'publyapp-ci-gate-bootstrap-'),
		);

		try {
			mkdirSync(path.join(cwd, 'base-ref/packages/scripts-ts/src'), {
				recursive: true,
			});
			copyFileSync(
				realClassifierPath,
				path.join(cwd, 'base-ref/packages/scripts-ts/src/ci-changed-paths.ts'),
			);

			const { status, stdout, output } = runInline(script, cwd, {
				GITHUB_EVENT_NAME: 'merge_group',
				// Deliberately no GH_REPO/PR_NUMBER/GH_TOKEN, and PATH is left
				// alone (no stub `gh` on it): a genuine merge_group run never
				// reaches the pull_request branch that shells out to `gh`.
			});

			assert.equal(status, 0, stdout);
			assert.match(stdout, /^relevant=true \(merge_group event:/);
			assert.equal(output, 'relevant=true\n');
			assert.doesNotMatch(stdout, /MISSING BASE CLASSIFIER/);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
}
