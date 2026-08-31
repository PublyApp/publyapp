/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1977, dockerignore blank/comment-line false positive.
 *
 * ## Context
 *
 * The shadow guard (`packages/scripts-ts/src/check-dockerignore-shadow.ts`)
 * drops a shadow file when the path is BOTH git-ignored AND mirrored by an
 * exact line in the root `.dockerignore` (the parallelism contract, #1909
 * class: `.worktrees/`, `.dump/`, `.claude/`, ... are mirrored for exactly
 * this reason). Before the fix, `parseDockerignoreLine` returned
 * `{ kind: 'undecidable' }` for blank/comment lines AND for glob/negation
 * lines, and `isMirroredByDockerignore` bailed at the FIRST such line — so
 * any `.dockerignore` that opens with `# ...` (this repo's opens with
 * `# Git`) and holds blank/comment/glob lines made the mirror check answer
 * `false` for EVERY path, always. The user-visible symptom: dropping a
 * `.dump/Dockerfile.dockerignore` was reported with "git-ignored but NOT
 * mirrored by the root .dockerignore" — a message contradicted two lines
 * later by the exact `.dump/` mirror line itself.
 *
 * The fix (commit 7556ea925) introduced a third kind, `comment`, for lines
 * that carry no pattern (blank, `# ...`), SKIPPED by the mirror check, and
 * made `undecidable` lines skipped instead of bailing. Both changes are
 * exercised by this proof's fixture, which puts comment lines, blank lines
 * AND unanalysable globs (the `**` globstar pattern targeting `node_modules`,
 * plus `Dockerfile*` and `*.swp`) BEFORE
 * the exact `.worktrees/`/`.dump/` mirror lines — the real shape of this
 * repo's root `.dockerignore`.
 *
 * ## What the proof asserts (kept-red direction)
 *
 * The proof asserts the BUGGY outcome: the guard REPORTS the mirrored
 * shadow (exit 1, stderr names `.dump/Dockerfile.dockerignore`).
 *
 * - CORRECTED code: the comment/blank/glob lines are skipped and the exact
 *   `.dump/` line matches, the shadow is dropped, exit 0. `expect(code)
 *   .toBe(1)` FAILS as an AssertionError — the kept-red state the *Verify
 *   paired red proofs* step replays with inverted semantics.
 * - BUG re-introduced (any of: comment lines bail, undecidable lines bail,
 *   the exact mirror no longer matches, or the git-ignore filter is
 *   dropped): guard exits 1 naming the shadow → the assertions PASS → the
 *   replay step turns red with "proof test passed unexpectedly" — the
 *   stale-proof signal.
 *
 * Secondary assertion: `expect(output).toContain('.dump/Dockerfile.dockerignore')`
 * pins that the red names the actual shadow, not an unrelated exit code.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1977/red-1977-dockerignore-comment-blank-false-positive.test.ts
 *
 * Expected: FAIL — on corrected code the guard exits 0, so
 * `expect(code).toBe(1)` fails with an AssertionError.
 *
 * ## Mutation to introduce the red (restore the bug)
 *   Revert commit 7556ea925's source changes in
 *   packages/scripts-ts/src/check-dockerignore-shadow.ts (return `undecidable`
 *   for blank/comment lines in `parseDockerignoreLine`, and `return false`
 *   at the first `undecidable`/`comment` line in `isMirroredByDockerignore`)
 *   and re-run the replay: the guard then exits 1 and this proof PASSES,
 *   reddening the replay step.
 *
 * ## Adverse mutations (trace — three attempts)
 *
 * - A1 (undecidable-bail axis): keep the `comment` classification but change
 *   the mirror loop's `if (line.kind === 'undecidable') { continue; }` back
 *   to `return false`. CAUGHT: the fixture carries the `**` globstar pattern
 *   targeting `node_modules` before
 *   the exact `.dump/` line, so the guard bails, reports the shadow, and
 *   the proof PASSES → replay red. This axis is a different mechanism from
 *   the comment-line fix and is still covered by the same fixture.
 * - A2 (comment-bail axis): classify blank/comment lines as `comment` but
 *   change their skip in the mirror loop to `return false`. CAUGHT: the
 *   fixture opens with `# Git`, the guard bails on it, reports the shadow,
 *   and the proof PASSES → replay red.
 * - A3 (mirror-match axis): stop stripping the trailing `/` in
 *   `normalizeDockerignorePattern`, so the exact `.dump/` line becomes the
 *   segments `['.dump', '']` and can never match the path. CAUGHT: no
 *   exact mirror matches, the git-ignored shadow is reported, and the proof
 *   PASSES → replay red. This attacks pattern normalization, a third
 *   mechanism.
 * - N1 (no-bug neighbor, must NOT trip the proof): make
 *   `hasUndecidableCharacters` return false for every pattern. Observed:
 *   the proof STAYS red — glob lines become literal `exact` lines that
 *   still fail to match the path, and the exact `.dump/` line still
 *   mirrors it. The bug is not restored, so a neighbour that does not
 *   restore the defect does not turn the proof green.
 *
 * Every attempt that restores the false positive makes the kept-red proof
 * PASS, so the inverted replay goes red. The one attempt that does not
 * restore the defect (N1) leaves the proof red as intended. No mutation
 * was found that both restores the false positive AND keeps the replay
 * green.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

// apps/front/tests/proofs/1977/<this file> -> monorepo root via dirname + 5 hops.
const __filename = fileURLToPath(import.meta.url);
const MONOREPO_ROOT = resolve(
	dirname(__filename),
	'..',
	'..',
	'..',
	'..',
	'..',
);

const GUARD_PATH = path.join(
	MONOREPO_ROOT,
	'packages/scripts-ts/src/check-dockerignore-shadow.ts',
);

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
 * Build the fixture: a self-contained git repo whose root `.dockerignore`
 * opens with a comment, blank lines and unanalysable globs before the exact
 * `.dump/` mirror line — the real shape of this repo's `.dockerignore` (the
 * real one opens with `# Git` on line 1 and holds 31 blank/comment lines).
 * `leaked` here is `.dump/`: git-ignored AND mirrored.
 */
const buildFixture = async (): Promise<string> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-proof-1977-'));
	execFileSync('git', ['init', '-q'], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: 'ignore',
	});
	await writeFixtureFile(
		rootDir,
		'.dockerignore',
		'# Git\n\n**/node_modules\nDockerfile*\n*.swp\n\n.worktrees/\n.dump/\n',
	);
	await writeFixtureFile(rootDir, '.gitignore', '.dump/\n');
	await writeFixtureFile(rootDir, '.dump/Dockerfile.dockerignore', '');
	return rootDir;
};

/** Run the shadow guard CLI over the fixture root. */
const runGuard = (fixture: string) => {
	let output = '';
	let code = 0;
	try {
		output = execFileSync('node', [GUARD_PATH], {
			cwd: fixture,
			encoding: 'utf8',
			stdio: 'pipe',
			timeout: 30_000,
		});
	} catch (err) {
		const std = err as {
			stdout?: Buffer;
			stderr?: Buffer;
			status?: number;
		};
		if (typeof std.status !== 'number') {
			// Spawn failure (guard file deleted, node missing): the proof
			// could not measure. The classifier reads this marker as CORRUPT
			// PROOF, never as a kept-red.
			throw new Error(
				`MESURE IMPOSSIBLE — could not spawn the guard at ${GUARD_PATH}: ${(err as Error).message}`,
			);
		}
		output = [std.stdout, std.stderr]
			.filter((part): part is Buffer => part !== undefined)
			.map((part) => part.toString())
			.join('');
		code = std.status;
	}
	const GUARD_RED_BANNER = 'Found .dockerignore shadow file(s):';

	if (code !== 0 && !output.includes(GUARD_RED_BANNER)) {
		// A nonzero exit WITHOUT the guard's own red banner is a crash or a
		// scan failure, not a shadow finding. Classify as measurement
		// impossible — never as a kept-red.
		throw new Error(
			`MESURE IMPOSSIBLE — guard exited ${code} without naming a shadow: ${output}`,
		);
	}
	return { code, output };
};

test('RED: a shadow under a git-ignored AND mirrored path is falsely reported when the .dockerignore opens with blank/comment lines and globs (issue #1977)', async () => {
	const fixture = await buildFixture();
	try {
		const { code, output } = runGuard(fixture);

		// BUGGY condition (asserted): the guard reports the mirrored shadow.
		// On corrected code the comment/blank/glob lines are skipped, the
		// exact `.dump/` line matches, the shadow is dropped and the guard
		// exits 0 — so `expect(code).toBe(1)` FAILS, the kept-red state.
		// When it passes (a re-introduced bug), the secondary assertion
		// passes too, so the replay step turns red with "proof test passed
		// unexpectedly".
		expect(code).toBe(1);

		// Pin the red to the actual user-visible symptom: the guard NAMES
		// the shadow it must drop, contradicting the exact mirror line.
		if (code !== 0) {
			expect(output).toContain('.dump/Dockerfile.dockerignore');
		}
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
}, 60_000);
