/**
 * KEPT RED PROOF — issue #1891.
 *
 * ## Old defect (merge-base b23125271)
 *
 * At the branch's merge-base with `develop` (commit `b23125271`),
 * `isShadowFile` in `packages/scripts-ts/src/check-dockerignore-shadow.ts`
 * was:
 *
 *   const isShadowFile = (name: string): boolean =>
 *     name !== '.dockerignore' && name.toLowerCase().endsWith('.dockerignore');
 *
 * It exempted every file whose BASENAME is exactly `.dockerignore`,
 * regardless of directory. A subdirectory `.dockerignore` (e.g.
 * `apps/api/.dockerignore`) is authoritative for `docker build apps/api`
 * and silently re-includes everything the root `.dockerignore` excludes —
 * exactly the shape #1891 pins — yet the merge-base guard reported no
 * finding for it at all.
 *
 * ## What this test asserts (kept-red direction)
 *
 * This test asserts the OLD DEFECT directly: `apps/api/.dockerignore` is
 * ABSENT from `findDockerignoreShadows()`'s result on a fixture tree that
 * contains it alongside a legitimate root `.dockerignore`.
 *
 * - On the merge-base implementation, this assertion PASSES: the old
 *   `isShadowFile` exempts any exact `.dockerignore` basename, so the
 *   subdirectory file never reaches the findings array.
 * - On the CURRENT (corrected) production module, this assertion FAILS:
 *   the current `isShadowFile(name, lexicalParent)` only exempts the ROOT
 *   `.dockerignore` (`lexicalParent === undefined`); any other exact
 *   `.dockerignore` is a finding. `apps/api/.dockerignore` is reported, so
 *   `findings.includes('apps/api/.dockerignore')` is `true` and
 *   `expect(...).toBe(false)` throws an AssertionError.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1891/red-1891-tracked-subdir-dockerignore-exempted.test.ts
 *
 * Expected on the current worktree: FAIL — the assertion that
 * `apps/api/.dockerignore` is absent from findings throws an
 * AssertionError, because the corrected guard flags it.
 *
 * ## Mutation to restore the red (re-introduce the #1891 defect)
 *   In `packages/scripts-ts/src/check-dockerignore-shadow.ts`, replace:
 *     const isShadowFile = (name, lexicalParent) => {
 *       if (!name.toLowerCase().endsWith('.dockerignore')) return false;
 *       return !(lexicalParent === undefined && name === '.dockerignore');
 *     };
 *   with the merge-base body:
 *     const isShadowFile = (name) =>
 *       name !== '.dockerignore' && name.toLowerCase().endsWith('.dockerignore');
 *   (dropping the `lexicalParent` parameter). Re-run the replay: the
 *   assertion now passes (the subdirectory `.dockerignore` is exempted
 *   again), so this proof goes green — a signal the defect is back.
 *
 * ## Adverse mutations (trace — three attempts to keep the red test green
 * while restoring a subdirectory-.dockerignore exemption through a
 * different mechanism than the primary mutation)
 *
 * - A1: keep the current `isShadowFile` signature intact but special-case
 *   the literal string `'apps/api/.dockerignore'` in `walkForShadows`
 *   before pushing a finding. CAUGHT: this test's fixture root is a fresh
 *   `mkdtemp()` directory, and the finding is asserted by the SAME literal
 *   relative path `apps/api/.dockerignore` used by the fixture, so a
 *   path-literal special case still suppresses this exact finding and the
 *   test would go green — but such a change is not a "subdirectory
 *   .dockerignore exemption", it is a single-path allowlist hack that
 *   leaves every OTHER subdirectory `.dockerignore` correctly flagged;
 *   `apps/api/.dockerignore is rejected and named` in
 *   `check-dockerignore-shadow.test.ts` still fails for that same literal
 *   path (it asserts the same finding must be PRESENT), so the two tests
 *   contradict and the mutation cannot ship — the pre-existing green suite
 *   (29 tests) breaks. The adverse mutation is caught by the sibling
 *   assertion in the production test file, not by this proof alone, which
 *   is why this proof and the production suite are run together in the
 *   verification trace.
 * - A2: change the ASSERTION instead of the production code — e.g. assert
 *   on `findings.length` instead of on `findings.includes(...)`. CAUGHT:
 *   this only changes what the PROOF checks, not the production behavior;
 *   the corrected guard still flags `apps/api/.dockerignore`, so
 *   `findings.length` is `1`, not `0`, and an assertion of
 *   `findings.length === 0` still fails against corrected code — there is
 *   no way to phrase the assertion so it both matches the described old
 *   defect and passes on corrected code, because the corrected code
 *   demonstrably produces a non-empty, path-naming finding.
 * - A3: widen `SKIP_DIRS` to include `apps/api`. CAUGHT: this is a
 *   different axis (directory-skip list, not `isShadowFile`) but produces
 *   the same visible effect for THIS fixture — the finding disappears.
 *   However it breaks `apps/api/Dockerfile.dockerignore (empty) is
 *   detected and named` and every other `apps/api/...` fixture in the
 *   pre-existing 29-test suite (they all expect `apps/api/...` shadows to
 *   be found), so the change cannot ship without regressing tests this
 *   proof does not itself cover — again caught by the sibling suite, which
 *   the verification trace runs alongside this proof.
 *
 * No mutation was found that keeps this proof green AND leaves the
 * pre-existing 29-test suite green, without restoring the exact `#1891`
 * subdirectory-`.dockerignore` exemption the primary mutation restores.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

import { findDockerignoreShadows } from '../../../../../packages/scripts-ts/src/check-dockerignore-shadow.ts';

let rootDir: string;

beforeEach(async () => {
	rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-proof-1891-tracked-subdir-'),
	);
});

afterEach(async () => {
	await rm(rootDir, { recursive: true, force: true });
});

test('RED #1891: exact subdirectory apps/api/.dockerignore is absent from findings (old defect)', async () => {
	await writeFile(path.join(rootDir, '.dockerignore'), 'node_modules\n');
	await mkdir(path.join(rootDir, 'apps', 'api'), { recursive: true });
	await writeFile(path.join(rootDir, 'apps', 'api', '.dockerignore'), '');

	const findings = await findDockerignoreShadows({ rootDir });

	// OLD DEFECT (merge-base b23125271): the subdirectory `.dockerignore`
	// is exempted by exact basename, so it never reaches the findings
	// array. This assertion is the ideal the merge-base guard produced; on
	// the corrected current code the finding IS present, so this fails.
	expect(
		findings.includes('apps/api/.dockerignore'),
		`expected the OLD DEFECT — apps/api/.dockerignore silently exempted — got findings: ${JSON.stringify(findings)}`,
	).toBe(false);
});
