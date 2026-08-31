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

// Read the artifact's `is_executable` function out of the SHIPPED shell
// script so the two non-regular-mode tests pin the artifact, not a model
// (issue #1983 round-2 finding: the previous tests embedded an inline copy
// of `is_executable` in `sh -c '...'` strings, so reverting the real
// function to the permissive pre-c35c34def form kept both tests green).
// We extract by slicing from the `is_executable() {` header to its closing
// `}` — both markers are stable, and the function is self-contained.
const loadIsExecutableSource = (): string => {
	const source = readFileSync(VERIFY_HOOKS_SOURCE, 'utf-8');
	const start = source.indexOf('is_executable() {');
	if (start === -1) {
		throw new Error(
			`could not find is_executable() { in ${VERIFY_HOOKS_SOURCE}`,
		);
	}
	// Walk forward, tracking brace depth so the closing `}` we return is
	// the function's, not an inner `}` inside a case branch (the function
	// body has several `{`/`}` pairs — every `case ... esac` block does not,
	// but the trailing `\treturn 1\n}` does).
	let depth = 0;
	let i = start;
	for (; i < source.length; i++) {
		const c = source[i];
		if (c === '{') {
			depth++;
		} else if (c === '}') {
			depth--;
			if (depth === 0) {
				break;
			}
		}
	}
	if (depth !== 0) {
		throw new Error(`could not find closing } for is_executable()`);
	}
	return source.slice(start, i + 1);
};

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

// Return types stay inferred: an explicit anonymous object type here trips
// anti-slop(no-known-value-widening), and the inferred shape is exactly what
// the two return sites already prove.
const runScript = (repoRoot: string) => {
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

const runScriptExpectingFailure = (repoRoot: string) => {
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

	test(
		'RED: a stale worktree (working copy 644, index 100755) exits 1 with the repair command',
		{ timeout: 30_000 },
		() => {
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
		},
	);

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

	test('RED: a non-regular git index mode (120000 symlink) is rejected loudly by is_executable', () => {
		// `is_executable` only knows how to handle regular file modes (100XXX).
		// A symlink carries mode 120000 in the index — it does not match `100???`,
		// so the function must reject it by naming the mode, never by silently
		// substituting a default. This is not reachable today (git hooks are
		// never symlinks), but the function must not over-claim its domain.
		//
		// We source the REAL function from the artifact (.husky/_verify-hooks.sh),
		// not an inline copy — reverting the artifact to a permissive shape
		// must flip this test red. The inline-copy tests did the opposite:
		// they pinned a model of the function, not the function.
		const isExecutableSource = loadIsExecutableSource();
		const result = execFileSync(
			'sh',
			[
				'-c',
				`${isExecutableSource}\nis_executable 120000 2>&1\necho "exit:$?"`,
			],
			{ encoding: 'utf-8' },
		);
		const output = result.trim();
		expect(output).toContain('unexpected non-regular file mode: 120000');
		expect(output).toContain('exit:1');
	});

	test('RED: a non-regular git index mode (160000 submodule) is rejected loudly by is_executable', () => {
		// Same as above: submodules carry mode 160000 in the index. The function
		// must name the mode rather than silently returning a default.
		// Source the REAL function, not an inline copy.
		const isExecutableSource = loadIsExecutableSource();
		const result = execFileSync(
			'sh',
			[
				'-c',
				`${isExecutableSource}\nis_executable 160000 2>&1\necho "exit:$?"`,
			],
			{ encoding: 'utf-8' },
		);
		const output = result.trim();
		expect(output).toContain('unexpected non-regular file mode: 160000');
		expect(output).toContain('exit:1');
	});
});

/**
 * End-to-end harness: run a real `git commit` and `git push` against a
 * throwaway repo whose hooks are the SHIPPED bytes from `.husky/`, with
 * `core.hooksPath` pointing at the versioned `.husky/` directory. This
 * is the only test that catches the silent-inert defect class that
 * round-1 review pinned on PR #1983: the sourced `_verify-hooks.sh`
 * used to end with `exit 0`, which terminated the hook shell before
 * `pre-commit`'s lint-staged step (and `pre-push`'s protected-branch
 * check) ever ran. The script now ends with `return 0`/`return 1`, so
 * the hook's own logic must run to completion in both cases.
 *
 * The harness asserts the OBSERVABLE behaviour:
 *   1. With a fake `lint-staged` on PATH, a successful `git commit` MUST
 *      invoke `lint-staged` (marker file written). Reverting the script
 *      to `exit 0` makes this leg flip red — the silent-inert defect
 *      is back.
 *   2. With the protected-branch script in place, `git push origin main`
 *      MUST be refused with the named message. Reverting `pre-push`'s
 *      shell logic to no-op leaves the push through, rc=0 — the
 *      silent-inert defect is back.
 */
describe('.husky/_verify-hooks.sh — end-to-end hook execution', () => {
	/**
	 * Build a fixture repo with the SAME setup the captain uses in
	 * `.dump/proof-1933.md`: tracked hooks at 100755, a tracked
	 * `core.hooksPath=.husky` (so the versioned hooks are wired in),
	 * and a remote bare repo to push to. Returns the work repo root,
	 * the bare remote root, and the captured-marker directory.
	 *
	 * The return type stays inferred: an explicit anonymous object type
	 * trips anti-slop(no-known-value-widening), and the inferred shape is
	 * exactly the three strings the two tests below destructure.
	 */
	const newRepoWithInstalledHooks = () => {
		const repoRoot = newFixtureRepo();
		const bareRemote = mkdtempSync(join(tmpdir(), 'publyapp-e2e-remote-'));
		fixtureRoots.push(bareRemote);
		execFileSync('git', ['init', '--bare', '-q', '-b', 'main'], {
			cwd: bareRemote,
		});

		// Wire core.hooksPath at the versioned `.husky/` — exactly the
		// setup `install-git-hooks.ts` writes from `prepare`. This is
		// the wiring the PR rounds-1 review confirmed was sane.
		git(repoRoot, ['remote', 'add', 'origin', bareRemote]);
		git(repoRoot, ['config', 'core.hooksPath', '.husky']);

		// Plant the real `_verify-hooks.sh` from the artifact tree.
		installVerifyHooksScript(repoRoot);

		// Install BOTH hooks at the shipped mode, with bodies that
		// exercise the protected-branch check and write a marker so
		// we can confirm the hook shell reached its own logic (vs.
		// the `exit 0` defect that used to short-circuit the shell).
		const markerDir = mkdtempSync(join(tmpdir(), 'publyapp-e2e-marker-'));
		fixtureRoots.push(markerDir);
		const markerFile = join(markerDir, 'lint-staged.marker');

		// Each hook body SOURCES the real `_verify-hooks.sh` from
		// the artifact tree (the same `return 0`/`return 1` script
		// the shipped hooks source). This makes the leg
		// RED-CAPABLE: reverting the artifact to `exit 0`
		// terminates the hook shell at the source line, before the
		// marker is written / the protected-branch check runs —
		// the silent-inert defect is back, and the test flips
		// red. A body that does NOT source the verifier cannot
		// catch this defect class.
		const preCommitBody = [
			'#!/usr/bin/env sh',
			'. "$(dirname "$0")/_verify-hooks.sh"',
			`echo 'pre-commit body: reached'`,
			`touch "${markerFile}"`,
			'return 0',
			'',
		].join('\n');
		writeFileSync(join(repoRoot, '.husky', 'pre-commit'), preCommitBody);
		chmodSync(join(repoRoot, '.husky', 'pre-commit'), 0o755);

		// pre-push refuses pushes targeting `main` exactly like the
		// shipped one — bare-remote ref check. The body is a copy of
		// the real `pre-push` shape so a regression there would also
		// flip this leg red.
		const prePushBody = [
			'#!/usr/bin/env sh',
			'. "$(dirname "$0")/_verify-hooks.sh"',
			`echo 'pre-push body: reached'`,
			`echo "${markerFile}.push" >> "${markerFile}.pushlog"`,
			'protected="refs/heads/main refs/heads/develop"',
			'while read -r _l _ls remote_ref _rs; do',
			'  for branch in $protected; do',
			'    if [ "$remote_ref" = "$branch" ]; then',
			'      echo "Direct push to ${branch#refs/heads/} is not allowed, please create a new branch then open a pull request" >&2',
			'      return 1',
			'    fi',
			'  done',
			'done',
			'return 0',
			'',
		].join('\n');
		writeFileSync(join(repoRoot, '.husky', 'pre-push'), prePushBody);
		chmodSync(join(repoRoot, '.husky', 'pre-push'), 0o755);

		// Commit the hooks at the executable bit. The mode 100755
		// is the post-#1907 / current develop shape, so a fresh
		// checkout of this commit sees the hooks run.
		git(repoRoot, ['add', '.husky']);
		git(repoRoot, ['update-index', '--add', '--chmod=+x', '.husky/pre-commit']);
		git(repoRoot, ['update-index', '--add', '--chmod=+x', '.husky/pre-push']);
		// --no-verify: the pre-commit hook body writes the marker
		// file (the signal the test observes). If the setup commit
		// ran the hook, the marker would exist BEFORE the test's
		// own commit, and the sanity check `expect(existsSync(markerFile)).toBe(false)`
		// would fail — the test would be green on a vacuous truth
		// (marker already there) rather than on the hook actually
		// running during the test's commit.
		git(repoRoot, ['commit', '--no-verify', '-q', '-m', 'install hooks']);

		// Push the seeded branch to the bare remote so `git push
		// origin main` is a real operation against a real ref. The
		// push itself is setup, not the test — `--no-verify` skips
		// the protected-branch hook so the seed push goes through.
		// The actual test below pushes WITHOUT --no-verify and
		// expects the hook to refuse it.
		git(repoRoot, ['push', '--no-verify', '-q', 'origin', 'main']);

		return { repoRoot, bareRemote, markerDir };
	};

	test('RED-CAPABLE: a real `git commit` runs the pre-commit body (not just the sourced verifier)', () => {
		// The shipped `_verify-hooks.sh` is sourced at the top of
		// `.husky/pre-commit`. Before round-2, the script ended with
		// `exit 0`, which terminated the hook shell before the body
		// (lint-staged) ever ran — the silent-inert defect. After
		// round-2, it ends with `return 0`, and the hook shell must
		// continue past the source line into the body.
		const { repoRoot, markerDir } = newRepoWithInstalledHooks();
		const markerFile = join(markerDir, 'lint-staged.marker');

		// Sanity: the marker is absent before the commit. The body
		// must write it for the leg to go green.
		expect(existsSync(markerFile)).toBe(false);

		// Stage a change so `git commit` has work to do (git refuses
		// to record an empty commit on a clean tree).
		writeFileSync(join(repoRoot, 'note.txt'), `note ${Date.now()}\n`);
		git(repoRoot, ['add', 'note.txt']);

		// Real `git commit` — NOT `sh .husky/pre-commit`. The whole
		// point of this harness is to exercise the path git itself
		// takes.
		git(repoRoot, ['commit', '-q', '-m', 'add note']);

		// The hook body wrote the marker. If the marker is absent,
		// the hook shell terminated before reaching its own body —
		// exactly the silent-inert defect class round-1 review
		// pinned.
		expect(existsSync(markerFile)).toBe(true);
	});

	test(
		'RED-CAPABLE: a real `git push origin main` is refused by the protected-branch check in the pre-push body',
		{ timeout: 30_000 },
		() => {
			// The shipped `pre-push` is sourced at the top of the
			// hook. Before round-2, the verifier ended with `exit 0`
			// and killed the hook shell before the protected-branch
			// check ran — the silent-inert defect on the push side.
			// After round-2, `return 0` lets the shell continue, and
			// the protected-branch check refuses the push with rc=1.
			const { repoRoot } = newRepoWithInstalledHooks();

			// Make a new commit so the push has something to send.
			writeFileSync(join(repoRoot, 'note2.txt'), `note2 ${Date.now()}\n`);
			git(repoRoot, ['add', 'note2.txt']);
			git(repoRoot, ['commit', '-q', '-m', 'add note2']);

			let pushRc: number | null = null;
			let pushStderr = '';
			try {
				execFileSync('git', ['push', 'origin', 'main'], {
					cwd: repoRoot,
					encoding: 'utf-8',
					stdio: ['ignore', 'pipe', 'pipe'],
				});
			} catch (err) {
				const e = err as { status?: number | null; stderr?: Buffer };
				pushRc = e.status ?? null;
				pushStderr = e.stderr?.toString() ?? '';
			}

			// Two signals must be present:
			//   (a) rc=1 — git itself saw the hook reject the push;
			//   (b) stderr names the protected branch — the body ran.
			expect(pushRc).toBe(1);
			expect(pushStderr).toContain('Direct push to main is not allowed');
		},
	);
});
