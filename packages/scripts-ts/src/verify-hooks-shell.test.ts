/**
 * Spec for `.husky/_verify-hooks.sh` (issue #1933) — the shell companion to
 * `install-git-hooks.ts`. Runs the actual shell script in throwaway git
 * repos so the PORTABILITY claim (GNU stat, BSD stat, POSIX ls fallback) is
 * not a paper assertion: the same script that runs in CI also runs from
 * macOS dev machines and from the GitHub Actions runner.
 *
 * ## Why a separate file
 *
 * `install-git-hooks.ts` runs from `prepare` — i.e., `pnpm install` — and
 * covers a freshly cloned repo. The `.husky/_verify-hooks.sh` script runs
 * from `.husky/pre-commit` and `.husky/pre-push` and covers every git
 * operation that follows. They share the same intent (mode drift between
 * the index and the working copy) but exercise different runtimes; the
 * shell script must be tested independently because a regression in its
 * POSIX/BSD fallback branches would NOT be caught by the Node-only suite.
 *
 * ## Red-capability (paired proof)
 *
 * The "stale" leg below plants a 100755-in-index, 100644-in-working-copy
 * hook and asserts the script exits 1 with the cause AND the repair
 * command. Removing the `indexExecutable && !workingExecutable` branch
 * from the script flips this test green — that is the mutation that
 * restores the silent default.
 */
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

// The verify-hooks.sh script lives at the repo root (one level above
// `packages/`). Resolve its absolute path from this test file's URL rather
// than relying on `process.cwd()`, which is the package root when vitest
// is launched via `pnpm --filter scripts-ts exec vitest`.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const VERIFY_HOOKS_SOURCE = join(REPO_ROOT, '.husky', '_verify-hooks.sh');

const fixtureRoots: string[] = [];

const newFixtureRepo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'publyapp-verify-hooks-'));
	fixtureRoots.push(root);

	execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
	execFileSync('git', ['config', 'user.email', 'proof@test.local'], {
		cwd: root,
	});
	execFileSync('git', ['config', 'user.name', 'Proof Runner'], { cwd: root });
	execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: root });

	mkdirSync(join(root, '.husky'), { recursive: true });
	writeFileSync(join(root, 'README.md'), '# fixture\n');
	execFileSync('git', ['add', 'README.md'], { cwd: root });
	execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: root });

	return root;
};

afterEach(() => {
	for (const root of fixtureRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

/**
 * Install the real verify-hooks.sh into a fixture repo. We do this by
 * reading the file from the worktree root — the SAME file the install
 * hook will pick up in production.
 */
const installVerifyHooksScript = (repoRoot: string): void => {
	const content = readFileSync(VERIFY_HOOKS_SOURCE, 'utf-8');
	const targetPath = join(repoRoot, '.husky', '_verify-hooks.sh');
	writeFileSync(targetPath, content);
	chmodSync(targetPath, 0o755);
};

const git = (cwd: string, args: string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf-8',
		stdio: ['pipe', 'pipe', 'pipe'],
	}).trim();

const addExecutableHook = (
	repoRoot: string,
	hookName: string,
	body: string,
): string => {
	const path = join(repoRoot, '.husky', hookName);
	writeFileSync(path, body);
	git(repoRoot, ['add', '.husky']);
	git(repoRoot, ['update-index', '--add', '--chmod=+x', path]);
	git(repoRoot, ['commit', '-q', '-m', `add ${hookName}`]);
	chmodSync(path, 0o755);
	return path;
};

const runScript = (
	repoRoot: string,
): { status: number; stdout: string; stderr: string } => {
	const result = execFileSync(
		'sh',
		[join(repoRoot, '.husky', '_verify-hooks.sh')],
		{
			cwd: repoRoot,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		},
	);
	return { status: 0, stdout: result, stderr: '' };
};

const runScriptExpectingFailure = (
	repoRoot: string,
): { status: number | null; stdout: string; stderr: string } => {
	try {
		const result = execFileSync(
			'sh',
			[join(repoRoot, '.husky', '_verify-hooks.sh')],
			{
				cwd: repoRoot,
				encoding: 'utf-8',
				stdio: ['pipe', 'pipe', 'pipe'],
			},
		);
		return { status: 0, stdout: result, stderr: '' };
	} catch (err) {
		const error = err as {
			status?: number | null;
			stdout?: Buffer;
			stderr?: Buffer;
		};
		return {
			status: error.status ?? null,
			stdout: error.stdout?.toString() ?? '',
			stderr: error.stderr?.toString() ?? '',
		};
	}
};

describe('.husky/_verify-hooks.sh — issue #1933 shell-side guard', () => {
	test('GREEN: a healthy worktree (working copy 755, index 100755) exits 0', () => {
		const repoRoot = newFixtureRepo();
		installVerifyHooksScript(repoRoot);
		addExecutableHook(repoRoot, 'pre-commit', '#!/usr/bin/env sh\nexit 0\n');
		addExecutableHook(repoRoot, 'pre-push', '#!/usr/bin/env sh\nexit 0\n');

		const result = runScript(repoRoot);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe('');
	});

	test('RED: a stale worktree (working copy 644, index 100755) exits 1 with the repair command', () => {
		const repoRoot = newFixtureRepo();
		installVerifyHooksScript(repoRoot);
		const preCommit = addExecutableHook(
			repoRoot,
			'pre-commit',
			'#!/usr/bin/env sh\nexit 0\n',
		);
		const prePush = addExecutableHook(
			repoRoot,
			'pre-push',
			'#!/usr/bin/env sh\nexit 0\n',
		);

		// Mirror the pre-#1907 failure: working copy loses the executable
		// bit while the index still says 100755.
		chmodSync(preCommit, 0o644);
		chmodSync(prePush, 0o644);

		const result = runScriptExpectingFailure(repoRoot);

		expect(result.status).toBe(1);
		// The combined output (script writes to stderr AND stdout through
		// capture) names the cause AND the repair command.
		const combined = `${result.stdout}\n${result.stderr}`;
		expect(combined).toContain('pre-commit');
		expect(combined).toContain('pre-push');
		expect(combined).toContain('not executable');
		expect(combined).toContain('Repair:');
		expect(combined).toContain('chmod +x');
		expect(combined).toContain('INERT');
	});

	test('RED: a missing hook is named with the missing-file cause and the pnpm install repair', () => {
		const repoRoot = newFixtureRepo();
		installVerifyHooksScript(repoRoot);
		// Do NOT commit any hook — simulate an incomplete checkout.

		const result = runScriptExpectingFailure(repoRoot);

		expect(result.status).toBe(1);
		const combined = `${result.stdout}\n${result.stderr}`;
		expect(combined).toContain('missing');
		expect(combined).toContain('.husky/pre-commit');
		expect(combined).toContain('pnpm install');
	});
});
