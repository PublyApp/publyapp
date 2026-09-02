/**
 * KEPT RED PROOF — issue #1977.
 *
 * ## Old defect (merge-base b23125271)
 *
 * At the branch's merge-base with `develop` (commit `b23125271`),
 * `isMirroredByDockerignore` in
 * `packages/scripts-ts/src/check-dockerignore-shadow.ts` scanned a
 * candidate's path segments against the parsed root `.dockerignore` lines
 * IN FILE ORDER and returned `false` the instant it met an `undecidable`
 * line (negation `!`, a glob character, an empty/comment line) — even if a
 * LATER line in the same file would have decidably matched the candidate
 * and mirrored it:
 *
 *   for (let index = 0; index < segments.length; index += 1) {
 *     for (const line of parsed) {
 *       if (line.kind === 'undecidable') {
 *         return false;               // short-circuits before later lines
 *       }
 *       ...
 *     }
 *   }
 *
 * When a git-ignored shadow candidate was declared `false` (not mirrored)
 * this way, the CLI printed a specific diagnosis blaming the parallelism
 * contract:
 *
 *   "At least one of these paths is git-ignored but NOT mirrored by the
 *   root .dockerignore — Docker still ships it in the build context."
 *
 * That diagnosis is FALSE for this fixture: the root `.dockerignore` DOES
 * carry a later exact line (`leaked/Dockerfile.dockerignore`) that would
 * decidably mirror the candidate — the guard just never reached it because
 * an earlier undecidable line (`!placeholder-undecidable`) short-circuited
 * the scan first. This is the exact false-cause mechanism #1977 pins: the
 * guard states a specific, wrong reason ("not mirrored") instead of "cannot
 * decide" or reaching the later decidable line.
 *
 * ## What this test asserts (kept-red direction)
 *
 * Fixture: a real git repository (`isInsideWorkTree` requires a `.git`
 * dir for `createGitIgnoreChecker` to activate at merge-base) with:
 *   - `.gitignore`: `leaked/` (the shadow candidate's directory is
 *     git-ignored)
 *   - root `.dockerignore`:
 *       node_modules
 *       !placeholder-undecidable      <- undecidable, encountered FIRST
 *       leaked/Dockerfile.dockerignore <- exact, would decidably mirror
 *   - `leaked/Dockerfile.dockerignore` (the shadow file itself)
 *
 * This test runs the real CLI binary (`node check-dockerignore-shadow.ts`)
 * against the fixture. Before the kept-red assertion, it checks a chain of
 * MEASUREMENT PRECONDITIONS as non-assertion facts (spawn succeeded, the
 * guard's fail-loud exit code 1 was observed, the fixture's shadow path is
 * named in stderr, the guard's ordinary header is present) — any gap there
 * throws a plain `Error` carrying the `MESURE IMPOSSIBLE` marker so
 * `classifyProof()` (`apps/front/scripts/ci/classify-proof.mts`) reports
 * CORRUPT PROOF rather than a false "kept red". Only once every
 * precondition holds does the test assert that stderr contains the false
 * diagnosis text "NOT mirrored by the root .dockerignore" — the ONE
 * `expect(...)` call in this test, and the only line allowed to fail with
 * an `AssertionError`.
 *
 * - On the merge-base implementation, this assertion PASSES (verified
 *   directly against a `git show b23125271:...` extraction of the file in
 *   the accompanying trace `.dump/preuve-1977.md`): the CLI prints exactly
 *   that diagnosis.
 * - On the CURRENT (corrected) production module, this assertion FAILS:
 *   the current CLI does not parse `.dockerignore` contents, does not
 *   consult git-ignore status at all, and its output never contains the
 *   string "NOT mirrored" — the mirror-parsing code path that could ever
 *   emit that diagnosis was deleted. The shadow is still reported (by
 *   filesystem walk alone), but the false-cause diagnostic is gone.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1977/red-1977-undecidable-negation-false-not-mirrored.test.ts
 *
 * Expected on the current worktree: FAIL with an `AssertionError` on the
 * final `expect(stderr).toContain(...)` call — every measurement
 * precondition holds (the guard still reports the fixture's shadow with
 * its ordinary exit-1 header), but stderr does not contain "NOT mirrored
 * by the root .dockerignore". A silent exit 0, a crashed spawn, or a
 * changed guard output shape would instead throw `MESURE IMPOSSIBLE` and
 * classify as CORRUPT PROOF, not a healthy kept-red.
 *
 * ## Mutation to restore the red (re-introduce the #1977 defect)
 *   Restore, in `packages/scripts-ts/src/check-dockerignore-shadow.ts`:
 *   the `parseDockerignoreLine`/`isMirroredByDockerignore` boolean mirror
 *   parser from merge-base `b23125271` (short-circuiting to `false` on the
 *   first `undecidable` line encountered, in file order, regardless of
 *   later decidable lines), the `createGitIgnoreChecker` consultation in
 *   `findDockerignoreShadows`, and the CLI's
 *   "git-ignored but NOT mirrored by the root .dockerignore" stderr block.
 *   Re-run the replay against the same fixture: the assertion passes again.
 *
 * ## Adverse mutations (trace — three attempts to keep the red test green
 * while restoring a false "not mirrored" diagnosis through a different
 * mechanism than the primary mutation)
 *
 * - A1: keep the mirror parser correct (scan every line before deciding,
 *   as the ideal round-6 tri-state design does) but leave the CLI stderr
 *   string literal "NOT mirrored by the root .dockerignore" printed
 *   unconditionally whenever ANY finding exists, regardless of git-ignore
 *   or mirror status. This reintroduces the false-cause text for THIS
 *   fixture, so THIS proof's kept-red assertion would unexpectedly PASS
 *   (the bug it documents would look present again while every measurement
 *   precondition above it also holds). CAUGHT AUTOMATICALLY, not by manual
 *   review: this test is declared in
 *   `red-1977-undecidable-negation-false-not-mirrored.test.ts.expected-red.json`
 *   as a test that MUST fail on correct code. `classifyProofWithManifest()`
 *   (`apps/front/scripts/ci/classify-proof.mts`) reads that declaration and
 *   reports `DECLARED RED PASSED` — a stale/corrupt proof — the moment the
 *   declared test passes, independent of any other test in the file. The
 *   same unconditional string also prints the same false diagnosis for the
 *   untracked, non-ignored fixtures in `check-dockerignore-shadow.test.ts`
 *   (e.g. "apps/api/Dockerfile.dockerignore (empty) is detected and named"
 *   — a plain untracked file, never git-ignored), which is independently
 *   reviewable as nonsensical (a claimed git-ignore/mirror relationship
 *   that cannot exist without consulting git-ignore or the root file at
 *   all) but is not the mechanism this proof relies on to catch A1.
 * - A2: change the ASSERTION instead of production code — e.g. assert
 *   stderr contains the generic "REPLACES" text instead of the specific
 *   "NOT mirrored" phrase. CAUGHT: the current corrected CLI DOES print
 *   "REPLACES" (see the generic shadow-file diagnostic, still present),
 *   so this weaker assertion would pass on corrected code too — it
 *   proves nothing about the #1977 defect and is exactly the kind of
 *   proof this convention forbids (asserting a symptom every finding
 *   produces, not the specific false-cause mechanism).
 * - A3: change the FIXTURE instead of restoring guard logic — e.g. omit
 *   the `.gitignore` file so `leaked/` is not git-ignored. CAUGHT: without
 *   an ignored path, `createGitIgnoreChecker`'s consultation branch in the
 *   merge-base guard is never entered (the `!ignoredReal.has(...)` early
 *   return fires), so `isMirroredByDockerignore` is never called and the
 *   false diagnosis never fires — the test would go green for the wrong
 *   reason (no git-ignore signal at all) rather than proving the
 *   short-circuit-on-undecidable-line defect. The fixture's `.gitignore`
 *   is therefore load-bearing, not incidental.
 *
 * No mutation was found that keeps this proof green AND avoids either (a)
 * an unconditional/hardcoded diagnosis string divorced from actual
 * git-ignore/mirror computation, or (b) weakening the assertion to a
 * generic substring every finding already produces.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, test, expect } from 'vitest';

const cliPath = fileURLToPath(
	new URL(
		'../../../../../packages/scripts-ts/src/check-dockerignore-shadow.ts',
		import.meta.url,
	),
);

let repoDir: string;

const git = (args: string[]): void => {
	const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
	if (result.error || result.status !== 0) {
		throw new Error(
			`MESURE IMPOSSIBLE: git ${args[0] ?? '<missing command>'} failed while preparing the fixture: ${result.error?.message ?? result.stderr ?? `status ${String(result.status)}`}`,
		);
	}
};

beforeEach(async () => {
	repoDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-proof-1977-'));
	git(['init', '-q']);
	git(['config', 'user.email', 't@t.com']);
	git(['config', 'user.name', 't']);

	// `leaked/` is git-ignored, so the merge-base guard's git-ignore
	// consultation branch activates for the candidate inside it.
	await writeFile(path.join(repoDir, '.gitignore'), 'leaked/\n');

	// The undecidable negation `!placeholder-undecidable` is encountered
	// BEFORE the decidable exact line `leaked/Dockerfile.dockerignore` that
	// would actually mirror the candidate — the exact #1977 mechanism.
	await writeFile(
		path.join(repoDir, '.dockerignore'),
		'node_modules\n!placeholder-undecidable\nleaked/Dockerfile.dockerignore\n',
	);

	await mkdir(path.join(repoDir, 'leaked'), { recursive: true });
	await writeFile(path.join(repoDir, 'leaked', 'Dockerfile.dockerignore'), '');

	git(['add', '.gitignore', '.dockerignore']);
	git(['commit', '-q', '-m', 'proof fixture']);
});

afterEach(async () => {
	await rm(repoDir, { recursive: true, force: true });
});

test('RED #1977: a git-ignored candidate mirrored by a later decidable line is falsely diagnosed as NOT mirrored', () => {
	const result = spawnSync('node', [cliPath], {
		cwd: repoDir,
		encoding: 'utf8',
	});

	// MEASUREMENT PRECONDITIONS (non-assertion): each of these confirms the
	// harness actually exercised the guard against the intended fixture
	// before the kept-red assertion runs. A failure here is a broken
	// measurement, not a "defect absent" result, so it throws a plain
	// `Error` carrying the `MESURE IMPOSSIBLE` marker — `classifyProof()` in
	// `apps/front/scripts/ci/classify-proof.mts` reads the first token of
	// the failure message to tell an `AssertionError` (kept-red, OK) apart
	// from a thrown `Error` (measurement impossible, CORRUPT PROOF). Only
	// the FINAL check below is allowed to be an `expect(...)` assertion.
	if (result.error) {
		throw new Error(
			`MESURE IMPOSSIBLE: spawning the CLI failed: ${result.error.message}`,
		);
	}
	if (result.status !== 1) {
		throw new Error(
			`MESURE IMPOSSIBLE: CLI exited with status ${JSON.stringify(result.status)}, expected the guard's fail-loud rejection (status 1) — the fixture no longer produces a shadow finding to diagnose. stdout: ${result.stdout ?? ''} stderr: ${result.stderr ?? ''}`,
		);
	}
	const stderr = result.stderr ?? '';
	if (!stderr.includes('leaked/Dockerfile.dockerignore')) {
		throw new Error(
			`MESURE IMPOSSIBLE: stderr does not name the shadow path 'leaked/Dockerfile.dockerignore' — the guard did not report the fixture's finding at all, so no diagnosis (false or otherwise) could have been reached. stderr: ${stderr}`,
		);
	}
	const hasGuardHeader =
		stderr.includes('Found .dockerignore shadow entry(s):') ||
		stderr.includes('Found .dockerignore shadow file(s):');
	if (!hasGuardHeader) {
		throw new Error(
			`MESURE IMPOSSIBLE: stderr is missing the guard's ordinary shadow-entry header — this is not the guard's normal output shape, so the fixture did not exercise the guard as intended. stderr: ${stderr}`,
		);
	}

	// KEPT-RED ASSERTION (the only permitted AssertionError in this test):
	// OLD DEFECT (the #1977 short-circuit-on-undecidable-line mirror
	// parser, present at the branch's merge-base with `develop`,
	// `b23125271`, before this branch's #1891/#1977 fix commits): the
	// guard's mirror scan short-circuited on the first undecidable line and
	// blamed "NOT mirrored" even though a later decidable line in the same
	// file would have mirrored the candidate. On corrected current code
	// this specific diagnosis text is never printed (the mirror parser and
	// the git-ignore consultation it depended on were deleted).
	expect(stderr).toContain('NOT mirrored by the root .dockerignore');
});
