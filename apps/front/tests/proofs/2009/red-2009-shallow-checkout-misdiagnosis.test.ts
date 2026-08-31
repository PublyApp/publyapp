/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #2009.
 *
 * ## Context
 *
 * When GitHub Actions checks out with `fetch-depth: 1`, the feature-ancestry
 * guard (`apps/front/e2e/helpers/feature-ancestry.ts`) ran only `git merge-base
 * --is-ancestor <sha> HEAD`. When a commit is absent from a shallow checkout,
 * `merge-base` exits 128 (not 1) — but the old code treated ANY non-zero exit
 * as "not an ancestor" and threw "This branch is older than the merge... Rebase
 * on top of develop." A rebase cannot fetch a commit the checkout never had.
 *
 * PR #2009 fixed this: the guard now runs `git cat-file -e <sha>^{commit}`
 * before the ancestry probe. If the commit is absent, it throws a different
 * message — naming "shallow checkout (fetch-depth: 1)" and prescribing
 * "fetch-depth: 0" — never "rebase".
 *
 * ## What the proof asserts
 *
 * A GENUINE shallow clone (`git clone --depth 1`) whose history does NOT contain
 * the chosen commit. The proof asserts the BUG: the error message says
 * "older than the" + "Rebase" — the old deflected guidance. On correct (#2009)
 * code the message instead says "no history" + "fetch", so the assertion
 * FAILS with an AssertionError — the kept-red state the CI step demands.
 *
 * ## Three-state discrimination
 *
 * - BUG PRESENT (pre-#2009, merge-base only): the commit is absent, merge-base
 *   exits 128, the guard throws "older than" + "Rebase". The assertion
 *   (expect message to contain "Rebase") PASSES → the CI step reports the
 *   proof is STALE.
 *
 * - BUG ABSENT (post-#2009, cat-file pre-check): the guard throws "no history"
 *   + "fetch" + "shallow checkout". The assertion FAILS with an
 *   AssertionError — the kept-red state the CI step demands.
 *
 * - MESURE IMPOSSIBLE: the shallow clone cannot be created, git is absent, or
 *   the throw is not an Error. The test THROWS — the runner classifies a thrown
 *   Error as a broken measurement and fails CI loudly.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/2009/red-2009-shallow-checkout-misdiagnosis.test.ts
 *
 * Expected: FAIL — on correct code the shallow-checkout guard says "fetch",
 * not "rebase".
 *
 * ## Mutations to introduce the red (restore the bug)
 *
 * 1. In `feature-ancestry.ts`, remove the `cat-file -e` pre-check and go
 *    straight to `merge-base --is-ancestor`. The commit is absent, merge-base
 *    exits 128 (non-zero), and the guard throws "older than" + "Rebase" — the
 *    assertion passes, the proof goes stale.
 *
 * 2. Or: set `fetch-depth: 1` on the front-e2e test job checkout and remove the
 *    `#2000` workflow pinning test. The guard has no history to evaluate and
 *    the old code misreports it as a stale branch.
 *
 * ## Honest limits
 *
 * - The proof builds a REAL shallow clone with `git clone --depth 1` against a
 *   throwaway `file://` source. It does NOT mock git — the `cat-file -e` exit
 *   128 is real, the `merge-base` exit 128 is real, and the message divergence
 *   is real.
 * - The proof pins BOTH the shallow-clone case AND the sibling-branch case in
 *   one file: the second test confirms that a present-but-not-ancestor commit
 *   still says "Rebase" (the #1726 behavior is preserved). This pins the
 *   regression boundary so a future change cannot silently swallow the
 *   not-an-ancestor case.
 * - Runs under `@vitest-environment node` (no jsdom needed — this is a pure git
 *   subprocess measurement).
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { checkFeatureAncestry } from '../../../e2e/helpers/feature-ancestry.ts';

const git = (cwd: string, args: string[]): string =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

interface GitResult {
	status: number;
	stderr: string;
}

const gitMayFail = (cwd: string, args: string[]): GitResult => {
	try {
		execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		return { status: 0, stderr: '' };
	} catch (error) {
		const err = error as { status?: unknown; stderr?: Buffer | string };
		const status = typeof err.status === 'number' ? err.status : -1;
		let stderr: string;
		if (typeof err.stderr === 'string') {
			stderr = err.stderr;
		} else if (err.stderr instanceof Buffer) {
			stderr = err.stderr.toString('utf8');
		} else {
			stderr = String(error);
		}
		return { status, stderr: stderr.trim() };
	}
};

const writeFixtureFile = async (
	rootDir: string,
	relativePath: string,
	contents: string,
): Promise<void> => {
	const absolute = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolute), { recursive: true });
	await writeFile(absolute, contents);
};

/**
 * Builds a GENUINE shallow clone (`git clone --depth 1`) of a throwaway
 * `file://` source repo. The clone's HEAD is the source's second commit;
 * the source's FIRST commit (missingCommit) is NOT in the clone's history
 * because `--depth 1` truncated it. This replicates exactly the GitHub
 * Actions `fetch-depth: 1` condition that triggered #2009.
 */
const buildShallowCloneMissingCommit = async (): Promise<{
	source: string;
	clone: string;
	missingCommit: string;
}> => {
	const source = await mkdtemp(path.join(os.tmpdir(), 'publyapp-2009-source-'));

	git(source, ['init', '-b', 'main']);
	git(source, ['config', 'user.name', 'Proof Runner']);
	git(source, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(source, 'first.md', 'first commit\n');
	git(source, ['add', 'first.md']);
	git(source, ['commit', '-m', 'first']);
	const missingCommit = git(source, ['rev-parse', 'HEAD']).trim();

	await writeFixtureFile(source, 'second.md', 'second commit\n');
	git(source, ['add', 'second.md']);
	git(source, ['commit', '-m', 'second']);

	const clone = await mkdtemp(path.join(os.tmpdir(), 'publyapp-2009-clone-'));
	execFileSync('git', ['clone', '--depth', '1', `file://${source}`, clone], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	// Sanity: the clone must be genuinely shallow and the commit must be absent.
	if (git(clone, ['rev-parse', '--is-shallow-repository']).trim() !== 'true') {
		throw new Error(
			`MESURE IMPOSSIBLE: clone is not shallow — git clone --depth 1 failed to produce a shallow repo.`,
		);
	}
	const presence = gitMayFail(clone, [
		'cat-file',
		'-e',
		`${missingCommit}^{commit}`,
	]);
	if (presence.status === 0) {
		throw new Error(
			`MESURE IMPOSSIBLE: the missing commit IS present in the shallow clone — the fixture did not truncate history as designed.`,
		);
	}

	return { source, clone, missingCommit };
};

/**
 * Builds a FULL (non-shallow) repository where the chosen commit exists on a
 * sibling branch — present in the object store but NOT an ancestor of HEAD.
 * This is the #1726 "predating branch" case: the guard must still say
 * "Rebase" because the commit IS present, just not reachable from HEAD.
 */
const buildSiblingBranchRepo = async (): Promise<{
	rootDir: string;
	siblingCommit: string;
}> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-2009-side-'));

	git(rootDir, ['init', '-b', 'main']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(rootDir, 'main.md', 'main work\n');
	git(rootDir, ['add', 'main.md']);
	git(rootDir, ['commit', '-m', 'main-1']);

	git(rootDir, ['checkout', '-b', 'side']);
	await writeFixtureFile(rootDir, 'side.md', 'feature work\n');
	git(rootDir, ['add', 'side.md']);
	git(rootDir, ['commit', '-m', 'feature (#1457)']);
	const siblingCommit = git(rootDir, ['rev-parse', 'HEAD']).trim();

	// main advances past the fork point: the feature commit is present but NOT
	// an ancestor of HEAD.
	git(rootDir, ['checkout', 'main']);
	await writeFixtureFile(rootDir, 'main.md', 'main work, continued\n');
	git(rootDir, ['add', 'main.md']);
	git(rootDir, ['commit', '-m', 'main-2']);

	return { rootDir, siblingCommit };
};

const GIT_ARTIFACT_TEST_TIMEOUT = 30_000;

// ─── The paired proof ─────────────────────────────────────────────────────────

test(
	'DEFECT: shallow checkout without the commit is misreported as "older than the merge — Rebase" (issue #2009)',
	async () => {
		/**
		 * On the FIXED code (#2009), checkFeatureAncestry throws a message about
		 * "no history" + "fetch" + "shallow checkout". The proof asserts the BUG:
		 * that the message says "older than the" + "Rebase". On fixed code that
		 * assertion FAILS with an AssertionError (kept-red).
		 *
		 * On the BUGGY code (pre-#2009, merge-base only), the guard throws the
		 * "older than" + "Rebase" message — the assertion PASSES (stale proof).
		 */
		const { source, clone, missingCommit } =
			await buildShallowCloneMissingCommit();

		try {
			let thrown: Error | undefined;
			try {
				checkFeatureAncestry(missingCommit, 'publish-now (#1457)', {
					cwd: clone,
				});
			} catch (e) {
				thrown = e instanceof Error ? e : new Error(String(e));
			}

			// Must throw: the commit is absent, the guard must not silently pass.
			expect(
				thrown,
				'checkFeatureAncestry should have thrown for a missing commit',
			).toBeDefined();

			const message = thrown!.message;

			// The BUG: the guard says "older than the merge" and "Rebase" —
			// misdiagnosing missing history as a stale branch. On FIXED code
			// these assertions FAIL: the message says "no history" + "fetch".
			expect(message).toMatch(/older than the .* merge/);
			expect(message).toMatch(/Rebase/);
			expect(message).toMatch(/publish-now/);
		} finally {
			await rm(source, { recursive: true, force: true });
			await rm(clone, { recursive: true, force: true });
		}
	},
	GIT_ARTIFACT_TEST_TIMEOUT,
);

test(
	'CONTEXT: a present-but-not-ancestor commit on a sibling branch still says "older than" + "Rebase" (the #1726 case is preserved, not swallowed by #2009)',
	async () => {
		/**
		 * Pins the regression boundary: #2009 adds a cat-file -e pre-check for
		 * ABSENT commits, but present-but-not-ancestor commits must STILL fall
		 * through to the original #1726 "older than" + "Rebase" message. On
		 * both buggy and fixed code this test asserts that "Rebase" appears —
		 * so it is a CONTEXT pin, not a kept-red test.
		 *
		 * This test is NOT declared in expected-red: it must PASS on fixed code
		 * (and on buggy code). If it ever fails, the #2009 fix swallowed the
		 * not-an-ancestor case — a regression.
		 */
		const { rootDir, siblingCommit } = await buildSiblingBranchRepo();

		try {
			let thrown: Error | undefined;
			try {
				checkFeatureAncestry(siblingCommit, 'publish-now (#1457)', {
					cwd: rootDir,
				});
			} catch (e) {
				thrown = e instanceof Error ? e : new Error(String(e));
			}

			expect(thrown, 'present-but-not-ancestor must throw').toBeDefined();

			const message = thrown!.message;
			expect(message).toMatch(/older than the .* merge/);
			expect(message).toMatch(/Rebase/);
			expect(message).toMatch(/publish-now/);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	},
	GIT_ARTIFACT_TEST_TIMEOUT,
);
