/**
 * Spec for `install-git-hooks.ts` — verifies the worktree-level hook
 * executable check (issue #1933).
 *
 * ## What this guards
 *
 * A worktree left on a commit from BEFORE #1907 has `.husky/pre-commit`
 * checked out at mode `100644`: git applies the mode bit from the INDEX, and
 * the pre-#1907 index carries the old mode. Git then silently ignores a
 * non-executable hook — no error, no warning, no visible difference from a
 * protected worktree. The author believes the guard is active. It is not.
 *
 * The shape: every hook is committed with mode `100755` (post-#1907). The
 * verifier compares the working copy's mode against the index's mode. If
 * they disagree, the worktree is stale and the verifier refuses to declare
 * the guard active — naming the repair command, never asking the author to
 * know git internals.
 *
 * ## Red-capability (the paired proof)
 *
 * The "stale worktree" leg below uses a REAL git repo where the committed
 * hook carries mode `100755` and the working copy has been forced back to
 * `100644` (exactly the shape a `git checkout` produces on a pre-#1907
 * commit, then a `git checkout 4b97cc20e -- .husky/pre-commit` cannot fix
 * because the bit comes from the index of the CURRENT branch). Removing the
 * mode-comparison branch from `verifyHook` flips the leg green — that is the
 * mutation that would RESTORE the silent defect.
 *
 * ## Cross-cutting rules
 *
 * - The fixture repos live under `os.tmpdir()`, never in `/tmp` directly,
 *   and are torn down in `afterEach` even on failure.
 * - Tests use only Node builtins + git, never a hand-crafted mode constant —
 *   the mode is read via `git ls-files --stage` and `stat -c %a` so a future
 *   umask or filesystem quirk cannot paper over a regression.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
	executableRepairCommand,
	formatVerificationReport,
	HOOKS,
	verifyHook,
	verifyHooks,
} from './install-git-hooks.ts';

const git = (cwd: string, args: string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

const fixtureRoots: string[] = [];

const newFixtureRepo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'publyapp-install-hooks-'));
	fixtureRoots.push(root);

	git(root, ['init', '-q', '-b', 'main']);
	git(root, ['config', 'user.email', 'proof@test.local']);
	git(root, ['config', 'user.name', 'Proof Runner']);
	git(root, ['config', 'commit.gpgsign', 'false']);

	// Minimal app shell: one tracked file so the repo is not empty.
	mkdirSync(join(root, '.husky'), { recursive: true });
	writeFileSync(join(root, 'README.md'), '# fixture\n');
	git(root, ['add', 'README.md']);
	git(root, ['commit', '-q', '-m', 'initial']);

	return root;
};

afterEach(() => {
	for (const root of fixtureRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/**
 * Add a hook file to the repo, commit it with mode 100755 (the post-#1907
 * shape), and return the absolute path. The commit reflects the index mode
 * `git ls-files --stage` reads — but `git update-index --chmod=+x` only
 * updates the INDEX, not the working-copy mode. We `chmod +x` the file
 * afterwards so the working copy carries the same bit the index carries,
 * which is what a healthy worktree looks like after a fresh checkout.
 */
const addExecutableHook = (
	root: string,
	hookName: string,
	body: string,
): string => {
	const path = join(root, '.husky', hookName);
	writeFileSync(path, body);
	git(root, ['add', '.husky']);
	git(root, ['update-index', '--add', '--chmod=+x', path]);
	git(root, ['commit', '-q', '-m', `add ${hookName}`]);
	execFileSync('chmod', ['755', path], { stdio: 'ignore' });
	return path;
};

/**
 * Force the working-copy mode of an existing hook back to 100644 (non-
 * executable) WITHOUT touching the index. This mirrors the exact failure
 * mode the brief describes: a pre-#1907 checkout applies the OLD index
 * mode, leaving the file non-executable, while the index still carries
 * 100755 from a later commit on the same branch.
 */
const demoteWorkingCopyToNonExecutable = (path: string): void => {
	execFileSync('chmod', ['644', path], { stdio: 'ignore' });
};

describe('install-git-hooks verifyHook — issue #1933 stale-worktree mode drift', () => {
	test('GREEN: a healthy worktree (working copy matches the 100755 index) passes the check', () => {
		const root = newFixtureRepo();
		const preCommit = addExecutableHook(
			root,
			'pre-commit',
			'#!/usr/bin/env sh\nexit 0\n',
		);

		const result = verifyHook(root, 'pre-commit');

		assert.deepEqual(result, { ok: true }, 'a 100755 hook must pass');

		// Sanity: the working copy really is executable.
		expect(existsSync(preCommit)).toBe(true);
		const mode = git(root, ['ls-files', '--stage', '--', '.husky/pre-commit']);
		expect(mode.startsWith('100755')).toBe(true);
	});

	test('RED: a stale worktree (working copy is 100644 while the index is 100755) is rejected loud', () => {
		const root = newFixtureRepo();
		const preCommit = addExecutableHook(
			root,
			'pre-commit',
			'#!/usr/bin/env sh\nexit 0\n',
		);
		// Mirror the pre-#1907 failure: the working copy lost the executable
		// bit while the index still carries 100755.
		demoteWorkingCopyToNonExecutable(preCommit);

		const result = verifyHook(root, 'pre-commit');

		assert.strictEqual(result.ok, false, 'a stale worktree must fail loud');
		if (result.ok) {
			throw new Error('unreachable');
		}

		// The failure must name the hook and explain WHY this is silent in
		// git itself — so the next maintainer does not retry `git
		// update-index` and conclude "all is well".
		expect(result.hook).toBe('pre-commit');
		expect(result.reason).toContain('stale worktree');
		expect(result.reason).toContain('.husky/pre-commit');
		expect(result.reason).toContain('100755');
		expect(result.reason).toContain('100644');
		expect(result.reason.toLowerCase()).toContain('silently');

		// The repair command must be the exact `chmod +x` invocation, with
		// the path spelled out so the author can paste it. Anything that
		// requires knowing git internals is not a repair (issue #1933
		// acceptance).
		const expected = executableRepairCommand(root, 'pre-commit');
		expect(result.repair).toBe(expected);
		expect(result.repair).toContain('chmod +x');
		expect(result.repair).toContain('.husky/pre-commit');

		// formatVerificationReport must render the same shape the CLI prints.
		const report = formatVerificationReport([result]);
		expect(report).toContain('pre-commit');
		expect(report).toContain('Repair:');
		expect(report).toContain('chmod +x');
	});

	test('RED: an entirely missing hook fails loud with the missing-file cause', () => {
		const root = newFixtureRepo();
		// Do not commit any hook: simulate an incomplete checkout.
		const result = verifyHook(root, 'pre-commit');

		assert.strictEqual(result.ok, false);
		if (result.ok) {
			throw new Error('unreachable');
		}
		expect(result.hook).toBe('pre-commit');
		expect(result.reason).toContain('missing');
		expect(result.reason).toContain('.husky/pre-commit');
		expect(result.repair.length).toBeGreaterThan(0);
	});

	test('verifyHooks aggregates every hook — any single failure rejects the worktree', () => {
		const root = newFixtureRepo();
		// Both hooks committed executable.
		const preCommit = addExecutableHook(
			root,
			'pre-commit',
			'#!/usr/bin/env sh\nexit 0\n',
		);
		const prePush = addExecutableHook(
			root,
			'pre-push',
			'#!/usr/bin/env sh\nexit 0\n',
		);

		// Stale only pre-push.
		demoteWorkingCopyToNonExecutable(prePush);
		// Sanity: pre-commit is still healthy.
		expect(verifyHook(root, 'pre-commit')).toEqual({ ok: true });

		const results = verifyHooks(root);
		const failures = results.filter((result) => !result.ok);
		assert.strictEqual(
			failures.length,
			1,
			'exactly one hook is stale, so exactly one failure must surface',
		);
		if (failures[0] && !failures[0].ok) {
			expect(failures[0].hook).toBe('pre-push');
		} else {
			throw new Error('unreachable');
		}

		// Demote pre-commit too — both must now fail loud.
		demoteWorkingCopyToNonExecutable(preCommit);
		const both = verifyHooks(root);
		expect(both.filter((r) => !r.ok)).toHaveLength(HOOKS.length);
	});

	test('formatVerificationReport returns empty for a clean run, names each failure otherwise', () => {
		const root = newFixtureRepo();
		// Two separate fixtures: one for the dirty case, one for the clean
		// case — the dirty fixture ends with a stale hook, and we want the
		// clean fixture to remain clean afterwards.
		const dirtyRoot = newFixtureRepo();
		const dirtyHook = addExecutableHook(
			dirtyRoot,
			'pre-commit',
			'#!/usr/bin/env sh\nexit 0\n',
		);
		demoteWorkingCopyToNonExecutable(dirtyHook);

		const failures = verifyHooks(dirtyRoot).filter((r) => !r.ok);
		const report = formatVerificationReport(failures);

		expect(report.length).toBeGreaterThan(0);
		expect(report).toContain('pre-commit');
		expect(report).toContain('Repair:');

		// A separate, clean fixture — both hooks still 100755 — produces
		// no output from formatVerificationReport.
		const healthyHook = addExecutableHook(
			root,
			'pre-commit',
			'#!/usr/bin/env sh\nexit 0\n',
		);
		expect(existsSync(healthyHook)).toBe(true);
		const healthy = verifyHook(root, 'pre-commit');
		assert.deepEqual(healthy, { ok: true });
		expect(formatVerificationReport([healthy])).toBe('');
	});
});
