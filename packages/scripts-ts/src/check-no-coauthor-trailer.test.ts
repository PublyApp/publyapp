import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { findCoAuthorTrailers } from './check-no-coauthor-trailer.ts';

// Issue #2347: the predicate is line-anchored, case-insensitive and tolerant
// of leading whitespace, so prose mentions and `Signed-off-by:` trailers pass
// while a real `Co-Authored-By:` trailer cannot hide. The CLI tests execute
// the REAL script (never a copy) and assert exit codes: a green run is
// evidence, not a claim.

const scriptPath = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'check-no-coauthor-trailer.ts',
);

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

	assert.equal(result.code, 1);
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

	assert.equal(result.code, 1);
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

	assert.equal(result.code, 1);
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

	assert.equal(result.code, 1);
	assert.match(result.stderr, /PR body line 3/);
});
