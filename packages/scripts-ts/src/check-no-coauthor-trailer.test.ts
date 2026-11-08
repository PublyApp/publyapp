import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { findCoAuthorTrailers } from './check-no-coauthor-trailer.ts';

// Issue #2347: the predicate is line-anchored, case-insensitive and tolerant
// of leading whitespace, so prose mentions and `Signed-off-by:` trailers pass
// while a real `Co-Authored-By:` trailer cannot hide. The CLI tests execute
// the REAL script (never a copy) and assert exit codes: a green run is
// evidence, not a claim. One test also executes the REAL commit-msg hook, so
// the hook's exit-code mapping (Finding 1) cannot silently regress.

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, 'check-no-coauthor-trailer.ts');
const hookPath = path.join(here, '../../../.husky/commit-msg');

type RunResult = { code: number; stdout: string; stderr: string };

const runScript = (args: string[], cwd?: string): RunResult => {
	const result = spawnSync(process.execPath, [scriptPath, ...args], {
		encoding: 'utf8',
		cwd,
	});

	return {
		code: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
};

const git = (cwd: string, args: string[]): string =>
	execFileSync(
		'git',
		[
			'-c',
			'user.name=Coauthor Test',
			'-c',
			'user.email=test@example.com',
			...args,
		],
		{ cwd, encoding: 'utf8' },
	);

const createRepo = (): string => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'no-coauthor-'));
	git(directory, ['init', '-q', '-b', 'main']);
	return directory;
};

const commit = (cwd: string, message: string): string => {
	git(cwd, ['commit', '-q', '--allow-empty', '--no-verify', '-m', message]);
	return git(cwd, ['rev-parse', 'HEAD']).trim();
};

// ---------------------------------------------------------------------------
// The predicate: edge cases from the issue.
// ---------------------------------------------------------------------------

test('a prose mention of Co-Authored-By is accepted', () => {
	assert.deepEqual(
		findCoAuthorTrailers(
			'fix: explain why we discussed Co-Authored-By: nobody\n\nIt came up in review.',
		),
		[],
	);
});

test('a mixed-case trailer is rejected', () => {
	assert.deepEqual(findCoAuthorTrailers('co-authored-by: A <a@b>'), [
		'co-authored-by: A <a@b>',
	]);
	assert.deepEqual(findCoAuthorTrailers('CO-AUTHORED-BY: A <a@b>'), [
		'CO-AUTHORED-BY: A <a@b>',
	]);
	assert.deepEqual(findCoAuthorTrailers('Co-Authored-By: A <a@b>'), [
		'Co-Authored-By: A <a@b>',
	]);
});

test('a trailer with leading whitespace is rejected', () => {
	assert.deepEqual(findCoAuthorTrailers('   Co-Authored-By: A <a@b>'), [
		'   Co-Authored-By: A <a@b>',
	]);
	assert.deepEqual(findCoAuthorTrailers('\tco-authored-by: A <a@b>'), [
		'\tco-authored-by: A <a@b>',
	]);
});

test('other *-by trailers are accepted', () => {
	assert.deepEqual(
		findCoAuthorTrailers(
			'fix: one thing\n\nSigned-off-by: A <a@b>\nReviewed-by: B <b@c>',
		),
		[],
	);
});

test('an empty message is accepted', () => {
	assert.deepEqual(findCoAuthorTrailers(''), []);
});

test('comment lines are ignored', () => {
	assert.deepEqual(
		findCoAuthorTrailers(
			'subject\n\n# Co-Authored-By: commented out\n#co-authored-by: also commented',
		),
		[],
	);
});

test('content after the git scissors line is ignored (verbose diff)', () => {
	// `git commit -v` appends the diff below a scissors line; git discards it
	// at cleanup, so the hook must too. A unified-diff context line
	// ` Co-Authored-By: A <a@b>` would otherwise false-positive.
	assert.deepEqual(
		findCoAuthorTrailers(
			'fix: edit intro\n' +
				'# ------------------------ >8 ------------------------\n' +
				'diff --git a/file b/file\n' +
				'index abc..def 100644\n' +
				'--- a/file\n' +
				'+++ b/file\n' +
				'@@ -1,3 +1,3 @@\n' +
				' old line\n' +
				'-removed\n' +
				' Co-Authored-By: A <a@b>\n',
		),
		[],
	);
});

test('only offending lines are returned, with their text intact', () => {
	assert.deepEqual(
		findCoAuthorTrailers(
			'subject\n\nCo-Authored-By: A <a@b>\nReviewed-by: B <b@c>\n  Co-Authored-By: C <c@d>',
		),
		['Co-Authored-By: A <a@b>', '  Co-Authored-By: C <c@d>'],
	);
});

// ---------------------------------------------------------------------------
// --message-file: what the commit-msg hook calls.
// ---------------------------------------------------------------------------

test('--message-file rejects a trailer and names the file, line and fix', () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'no-coauthor-'));
	const messageFile = path.join(directory, 'COMMIT_EDITMSG');
	writeFileSync(
		messageFile,
		'fix: subject\n\nCo-Authored-By: A <a@b>\n# comment\n',
	);

	const result = runScript(['--message-file', messageFile]);

	// Trailer found is exit 3 — its own code, never 1 (a too-old Node or a
	// failing pnpm exit 1; the commit-msg hook rejects only on 3).
	assert.equal(result.code, 3);
	assert.match(result.stderr, /Co-Authored-By trailer rejected/);
	assert.match(result.stderr, /COMMIT_EDITMSG:3:/);
	assert.match(result.stderr, /git commit --amend/);
});

test('--message-file accepts a clean message', () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'no-coauthor-'));
	const messageFile = path.join(directory, 'COMMIT_EDITMSG');
	writeFileSync(
		messageFile,
		'fix: subject\n\nWe discussed Co-Authored-By: in review.\nSigned-off-by: A <a@b>\n',
	);

	assert.equal(runScript(['--message-file', messageFile]).code, 0);
});

test('--message-file exits 2 when the file is unreadable', () => {
	const result = runScript([
		'--message-file',
		'/nonexistent/path/COMMIT_EDITMSG',
	]);

	assert.equal(result.code, 2);
	assert.match(result.stderr, /cannot read commit message file/);
});

test('unknown arguments exit 2', () => {
	const result = runScript(['--bogus']);

	assert.equal(result.code, 2);
});

// ---------------------------------------------------------------------------
// --range: what the PR check calls.
// ---------------------------------------------------------------------------

test('an empty range passes', () => {
	const repo = createRepo();
	commit(repo, 'fix: first');

	const result = runScript(['--range', 'HEAD..HEAD'], repo);

	assert.equal(result.code, 0, result.stderr);
});

test('a range whose commits are clean passes', () => {
	const repo = createRepo();
	const first = commit(repo, 'fix: first');
	commit(repo, 'fix: second\n\nSigned-off-by: A <a@b>');

	assert.equal(runScript(['--range', `${first}..HEAD`], repo).code, 0);
});

test('a range names each offending commit and the rebase fix', () => {
	const repo = createRepo();
	const clean = commit(repo, 'fix: first');
	const offending = commit(repo, 'fix: second\n\nCo-Authored-By: A <a@b>');

	const result = runScript(['--range', `${clean}..${offending}`], repo);

	assert.equal(result.code, 3);
	assert.match(result.stderr, new RegExp(`commit ${offending.slice(0, 7)}`));
	assert.match(result.stderr, /git rebase -i/);
});

test('a PR title with a trailer is rejected', () => {
	const repo = createRepo();
	commit(repo, 'fix: first');

	const result = runScript(
		['--range', 'HEAD..HEAD', '--title', 'Co-Authored-By: A <a@b>'],
		repo,
	);

	assert.equal(result.code, 3);
	assert.match(result.stderr, /PR title/);
});

test('a PR body with a trailer is rejected', () => {
	const repo = createRepo();
	commit(repo, 'fix: first');
	const bodyFile = path.join(repo, 'pr-body.md');
	writeFileSync(bodyFile, 'Closes #2347\n\nCo-Authored-By: A <a@b>\n');

	const result = runScript(
		['--range', 'HEAD..HEAD', '--body-file', bodyFile],
		repo,
	);

	assert.equal(result.code, 3);
	assert.match(result.stderr, /PR body line 3/);
});

// ---------------------------------------------------------------------------
// The real .husky/commit-msg hook: its exit-code mapping (Finding 1/5).
// ---------------------------------------------------------------------------

test('the commit-msg hook rejects only on exit 3 and warns on a broken run', () => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'no-coauthor-hook-'));
	const messageFile = path.join(directory, 'COMMIT_EDITMSG');
	// find_pnpm checks $HOME/.local/share/pnpm/pnpm first: a fake HOME pins
	// the hook to THIS stub pnpm, so the test drives every script exit code
	// itself while the hook and the real check script stay untouched.
	const home = path.join(directory, 'home');
	mkdirSync(path.join(home, '.local/share/pnpm'), { recursive: true });
	writeFileSync(
		path.join(home, '.local/share/pnpm/pnpm'),
		'#!/bin/sh\n' +
			'if [ -n "$HOOK_STUB_EXIT" ]; then echo \'node: Unknown file extension ".ts"\' >&2; exit "$HOOK_STUB_EXIT"; fi\n' +
			'shift\n' + // drop the `exec` pnpm subcommand; "$@" starts with `node`
			'exec "$@"\n',
		{ mode: 0o755 },
	);
	const runHook = (message: string, stubExit?: string): RunResult => {
		writeFileSync(messageFile, message);
		const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };

		if (stubExit !== undefined) {
			env.HOOK_STUB_EXIT = stubExit;
		}

		const result = spawnSync('sh', [hookPath, messageFile], {
			encoding: 'utf8',
			env,
		});

		return {
			code: result.status ?? 1,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
		};
	};

	// Clean message, script exits 0 → accepted.
	assert.equal(runHook('fix: subject\n').code, 0);

	// Trailer: the real script exits 3 → the hook refuses, naming the fix
	// (the grep fallback's message differs, so this pins the exit-3 branch).
	const rejected = runHook('fix: subject\n\nCo-Authored-By: A <a@b>\n');

	assert.notEqual(rejected.code, 0);
	assert.match(rejected.stderr, /Co-Authored-By trailer rejected/);
	assert.match(rejected.stderr, /remove the Co-Authored-By line above/);

	// Too-old Node: the script invocation exits 1 on a CLEAN message → the
	// hook must not refuse: warn and fall through to the grep fallback.
	const unrunnable = runHook('fix: subject\n', '1');

	assert.equal(unrunnable.code, 0, unrunnable.stderr);
	assert.match(unrunnable.stderr, /falling back to a simple grep/);

	// Grep fallback with a trailer: the script stub exits 1 (simulating a
	// broken run), the message HAS a trailer → the fallback must refuse it
	// with its own message. This pins the shell path that runs on machines
	// without pnpm/Node (the IDE/GUI case this hook exists for).
	const fallbackRejects = runHook(
		'fix: subject\n\nCo-Authored-By: A <a@b>\n',
		'1',
	);

	assert.notEqual(fallbackRejects.code, 0);
	assert.match(
		fallbackRejects.stderr,
		/this message contains a Co-Authored-By: trailer/,
	);
});
