import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { classifyRelevance, parseChangedFilesTotal } from './ci-changed-paths.mjs';

// These tests are the standing proof that the changed-path classifier fails
// closed at GitHub's 3,000-file "List pull request files" ceiling, rather
// than silently certifying an incomplete list as "not relevant". See #1017.

const pattern = '^(apps/front/|packages/shared-ts/)';

test('push runs are relevant by construction, without needing file evidence', () => {
	const result = classifyRelevance({
		eventName: 'push',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list containing a relevant path is relevant', () => {
	const files = ['apps/front/src/routes.ts', 'README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list with no relevant path is not relevant', () => {
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('an empty pull request (no files changed) is not relevant', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('BLOCKER: a truncated list that omits the relevant file fails closed to relevant', () => {
	// The exact false-green path from the review: the PR reports far more
	// changed files than the API actually returned (the 3,000-file ceiling),
	// and none of the returned files happen to match. A naive matcher would
	// report relevant=false here and let the heavy job skip.
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /incomplete/);
});

test('BLOCKER: exactly the 3,000-file ceiling with the total one over it fails closed', () => {
	const files = Array.from({ length: 3000 }, (_, i) => `docs/file-${i}.md`);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a missing changed_files total fails closed rather than assuming completeness', () => {
	const files = ['README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: undefined,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /missing|not a valid/);
});

test('a non-array file list (malformed API response) fails closed', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: null,
		changedFilesTotal: 5,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /not an array/);
});

test('a file count that exceeds the reported total also fails closed (anomalous, not just short)', () => {
	const files = ['a.txt', 'b.txt', 'c.txt'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 2,
		pattern,
	});

	assert.equal(result.relevant, true);
});

// ---------------------------------------------------------------------------
// parseChangedFilesTotal(): the exact boundary round 2 found broken. `gh
// api --jq` on a missing property (or a literal `null`) exits 0 with EMPTY
// stdout, and naive `Number('')` is `0` — a fabricated, valid-looking total.
// classifyRelevance() itself was always correct about undefined/null; the
// CLI was handing it a lie instead. These pin the raw-string boundary.
// ---------------------------------------------------------------------------

test('parseChangedFilesTotal: empty stdout (missing changed_files) is invalid', () => {
	assert.equal(parseChangedFilesTotal(''), undefined);
});

test('parseChangedFilesTotal: whitespace-only stdout is invalid', () => {
	assert.equal(parseChangedFilesTotal('   \n'), undefined);
});

test('parseChangedFilesTotal: literal "null" (jq\'s rendering of a null field) is invalid', () => {
	assert.equal(parseChangedFilesTotal('null\n'), undefined);
});

test('parseChangedFilesTotal: a non-numeric value is invalid', () => {
	assert.equal(parseChangedFilesTotal('abc'), undefined);
});

test('parseChangedFilesTotal: a negative value is invalid', () => {
	assert.equal(parseChangedFilesTotal('-1'), undefined);
});

test('parseChangedFilesTotal: a decimal value is invalid', () => {
	assert.equal(parseChangedFilesTotal('3.5'), undefined);
});

test('parseChangedFilesTotal: a valid non-negative integer, with surrounding whitespace, parses', () => {
	assert.equal(parseChangedFilesTotal('  42  \n'), 42);
});

test('parseChangedFilesTotal: zero is a valid, distinct value (a genuinely empty PR)', () => {
	assert.equal(parseChangedFilesTotal('0'), 0);
});

test('parseChangedFilesTotal: a large but plausible total parses', () => {
	assert.equal(parseChangedFilesTotal('3001'), 3001);
});

// ---------------------------------------------------------------------------
// CLI boundary: spawn the real scripts/ci-changed-paths.mjs entry point
// against a stubbed `gh`, exactly as the round-2 review demanded. The unit
// tests above prove classifyRelevance() and parseChangedFilesTotal() are
// each individually correct; this proves the CLI actually wires the raw
// `gh` stdout through parseChangedFilesTotal() rather than a bare Number().
// ---------------------------------------------------------------------------

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const cliScript = path.join(scriptsDirectory, 'ci-changed-paths.mjs');

/**
 * Builds a fake `gh` executable on its own PATH directory. It answers both
 * `gh api` calls the CLI makes: the PR's `changed_files` total (no
 * `--paginate`), and the paginated file list (`--paginate` present).
 * `respond.total` / `respond.files` are the raw stdout text `gh` would have
 * printed for each call — a real `gh api --jq` on an absent/null field
 * prints nothing, which these fixtures reproduce directly.
 */
const buildFakeGh = ({ total = '', files = '' }) => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-fake-gh-'));
	const ghPath = path.join(dir, 'gh');

	writeFileSync(
		ghPath,
		[
			'#!/usr/bin/env node',
			"const args = process.argv.slice(2);",
			"const isFilesCall = args.includes('--paginate');",
			`process.stdout.write(isFilesCall ? ${JSON.stringify(files)} : ${JSON.stringify(total)});`,
			'process.exit(0);',
			'',
		].join('\n'),
	);
	chmodSync(ghPath, 0o755);

	return dir;
};

const runCli = (pattern, fakeGhDir) => {
	const env = {
		...process.env,
		PATH: `${fakeGhDir}:${process.env.PATH}`,
		GITHUB_EVENT_NAME: 'pull_request',
		GH_REPO: 'radandevist/publyapp',
		PR_NUMBER: '1',
		GH_TOKEN: 'test-token',
	};
	delete env.GITHUB_OUTPUT;

	return spawnSync(process.execPath, [cliScript, pattern], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env,
	});
};

const withFakeGh = (respond, fn) => {
	const fakeGhDir = buildFakeGh(respond);
	try {
		return fn(fakeGhDir);
	} finally {
		rmSync(fakeGhDir, { recursive: true, force: true });
	}
};

test('CLI BOUNDARY: empty stdout for changed_files (missing/null field) fails closed to relevant=true', () => {
	// This is the review's literal repro: both real `gh` calls return empty
	// output. The real bug was `Number('')` === 0 turning that into a
	// certified-complete, certified-empty PR.
	withFakeGh({ total: '', files: '' }, (fakeGhDir) => {
		const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^relevant=true/);
	});
});

test('CLI BOUNDARY: literal "null" stdout for changed_files fails closed to relevant=true', () => {
	withFakeGh({ total: 'null\n', files: '' }, (fakeGhDir) => {
		const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^relevant=true/);
	});
});

test('CLI BOUNDARY: a genuinely empty, verified-complete PR (changed_files=0, no files) is not relevant', () => {
	withFakeGh({ total: '0\n', files: '' }, (fakeGhDir) => {
		const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /^relevant=false/);
	});
});

test('CLI BOUNDARY: a complete, matching file list is relevant', () => {
	withFakeGh(
		{ total: '1\n', files: 'apps/front/src/routes.ts\n' },
		(fakeGhDir) => {
			const result = runCli('^(apps/front/|packages/shared-ts/)', fakeGhDir);

			assert.equal(result.status, 0, result.stderr);
			assert.match(result.stdout, /^relevant=true/);
		},
	);
});

// ---------------------------------------------------------------------------
// GITHUB_OUTPUT: the round-3 review's BLOCKER. Every test above deletes
// GITHUB_OUTPUT and asserts only stdout — but stdout is diagnostic. The
// workflows branch on the `relevant=...` line appended to GITHUB_OUTPUT, and
// nothing above ever read that file back for a pull_request event that could
// legitimately answer either true or false. The reviewer's mutation
// (`relevant=${eventName !== 'pull_request'}` instead of
// `relevant=${relevant}` on the appendFileSync call) preserves every pure
// decision, every stdout message, and the push case — and silently flips
// every real pull request's actual gate signal to false. These tests read
// the real GITHUB_OUTPUT file back and assert its EXACT contents, so that
// exact mutation cannot pass.
// ---------------------------------------------------------------------------

/**
 * Like buildFakeGh, but the "files" call (`--paginate`) can be made to fail
 * (nonzero exit, so a real `gh` auth/rate-limit/network failure is
 * reproduced) instead of answering.
 */
const buildFakeGhWithFilesFailure = ({ total = '1\n' }) => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-fake-gh-fail-'));
	const ghPath = path.join(dir, 'gh');

	writeFileSync(
		ghPath,
		[
			'#!/usr/bin/env node',
			'const args = process.argv.slice(2);',
			"const isFilesCall = args.includes('--paginate');",
			'if (isFilesCall) {',
			"  process.stderr.write('gh: rate limit exceeded\\n');",
			'  process.exit(1);',
			'}',
			`process.stdout.write(${JSON.stringify(total)});`,
			'process.exit(0);',
			'',
		].join('\n'),
	);
	chmodSync(ghPath, 0o755);

	return dir;
};

/**
 * Runs the real CLI with a REAL GITHUB_OUTPUT file (never deleted) and
 * returns both stdout and the file's exact final contents.
 */
const runCliWithRealOutput = (pattern, fakeGhDir, extraEnv = {}) => {
	const outputDir = mkdtempSync(
		path.join(os.tmpdir(), 'publyapp-github-output-'),
	);
	const githubOutputPath = path.join(outputDir, 'github-output.txt');
	writeFileSync(githubOutputPath, '');

	try {
		const result = spawnSync(process.execPath, [cliScript, pattern], {
			cwd: repositoryRoot,
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${fakeGhDir}:${process.env.PATH}`,
				GITHUB_EVENT_NAME: 'pull_request',
				GH_REPO: 'radandevist/publyapp',
				PR_NUMBER: '1',
				GH_TOKEN: 'test-token',
				...extraEnv,
				GITHUB_OUTPUT: githubOutputPath,
			},
		});

		return { ...result, output: readFileSync(githubOutputPath, 'utf8') };
	} finally {
		rmSync(outputDir, { recursive: true, force: true });
	}
};

test('GITHUB_OUTPUT BLOCKER: a complete, matching PR writes exactly relevant=true', () => {
	withFakeGh(
		{ total: '1\n', files: 'apps/front/src/routes.ts\n' },
		(fakeGhDir) => {
			const { status, output } = runCliWithRealOutput(
				'^(apps/front/|packages/shared-ts/)',
				fakeGhDir,
			);

			assert.equal(status, 0);
			assert.equal(output, 'relevant=true\n');
		},
	);
});

test('GITHUB_OUTPUT BLOCKER: a complete, irrelevant PR writes exactly relevant=false', () => {
	withFakeGh({ total: '1\n', files: 'README.md\n' }, (fakeGhDir) => {
		const { status, output } = runCliWithRealOutput(
			'^(apps/front/|packages/shared-ts/)',
			fakeGhDir,
		);

		assert.equal(status, 0);
		assert.equal(output, 'relevant=false\n');
	});
});

test('GITHUB_OUTPUT BLOCKER: an incomplete/unverifiable PR (truncated count) writes exactly relevant=true', () => {
	withFakeGh({ total: '3001\n', files: 'README.md\n' }, (fakeGhDir) => {
		const { status, output } = runCliWithRealOutput(
			'^(apps/front/|packages/shared-ts/)',
			fakeGhDir,
		);

		assert.equal(status, 0);
		assert.equal(output, 'relevant=true\n');
	});
});

test('GITHUB_OUTPUT BLOCKER: a gh failure (rate limit / auth / network) exits nonzero and fabricates no output', () => {
	const fakeGhDir = buildFakeGhWithFilesFailure({ total: '1\n' });
	try {
		const { status, output } = runCliWithRealOutput(
			'^(apps/front/|packages/shared-ts/)',
			fakeGhDir,
		);

		assert.notEqual(status, 0);
		assert.equal(output, '');
	} finally {
		rmSync(fakeGhDir, { recursive: true, force: true });
	}
});
