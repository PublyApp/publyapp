/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1891, undetected subdirectory `.dockerignore` files.
 *
 * ## Context
 *
 * Before commit d8519269f, NO guard detected a `.dockerignore` placed in a
 * subdirectory of the repository root. The shadow guard
 * (`check-dockerignore-shadow`) deliberately exempts the canonical
 * `sub/.dockerignore` (BuildKit's additive sub-context feature), so a
 * `.dockerignore` outside the root was simply invisible to the whole gate
 * suite. That file is INERT when the build context is the repo root and
 * ACTIVE when the context is its own directory (verified by Docker probes):
 * two contexts of the same source build with two different exclusion sets,
 * in silence — the same context divergence #1849 names, different mechanism.
 *
 * The fix added `packages/scripts-ts/src/check-no-subdir-dockerignore.ts`,
 * which reports every `.dockerignore` whose lexical path is not the repo
 * root.
 *
 * ## What the proof asserts (kept-red direction)
 *
 * The proof asserts the BUGGY outcome: the new guard DOES NOT report a
 * subdirectory `.dockerignore` (exit 0, "No .dockerignore file outside the
 * repository root").
 *
 * - CORRECTED code: the guard names `apps/api/.dockerignore` and exits 1.
 *   `expect(code).toBe(0)` FAILS as an AssertionError — the kept-red state
 *   the *Verify paired red proofs* step replays with inverted semantics.
 * - BUG re-introduced (the finding logic removed, the walk scope shrunk, or
 *   the guard file deleted): guard exits 0 (or cannot spawn) → the
 *   assertion PASSES → the replay step turns red with "proof test passed
 *   unexpectedly" — the stale-proof signal. A deleted guard fails with the
 *   MESURE IMPOSSIBLE marker below, which the classifier reads as CORRUPT
 *   PROOF — the deletion is caught loudly either way.
 *
 * Secondary assertion: `expect(output).toContain('apps/api/.dockerignore')`
 * pins that a red exits for the right finding, not an unrelated failure.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1891/red-1891-subdir-dockerignore-undetected.test.ts
 *
 * Expected: FAIL — on corrected code the guard exits 1, so
 * `expect(code).toBe(0)` fails with an AssertionError.
 *
 * ## Mutation to introduce the red (restore the bug)
 *   In packages/scripts-ts/src/check-no-subdir-dockerignore.ts, make the
 *   finding branch unreachable (e.g. change
 *   `entry.name === '.dockerignore' && lexicalParent !== undefined` to
 *   `entry.name === '.dockerignore' && false`) and re-run the replay: the
 *   guard then exits 0 and this proof PASSES, reddening the replay step.
 *   Observed under this mutation: the proof PASSES (vitest exit 0) — the
 *   primary bug-restoring change is caught by the inverted replay.
 *
 * ## Adverse mutations (trace — observed outcomes)
 *
 * - A1 (walk-scope axis): do not recurse into subdirectories, so
 *   `apps/api/.dockerignore` is never visited. OBSERVED: the guard exits 0
 *   and the proof PASSES → replay red. This attacks traversal, a different
 *   mechanism from the finding condition.
 * - A2 (out-of-scope axis): add `apps` to SKIP_DIRS. OBSERVED: the walk
 *   skips the whole `apps/` tree, the guard exits 0 and the proof PASSES →
 *   replay red.
 * - A3 (deletion axis): delete the guard source file entirely. OBSERVED:
 *   `node <guard>` runs but cannot resolve the module (Cannot find module,
 *   exit 1), the guard emits no red banner, and the proof raises the MESURE
 *   IMPOSSIBLE marker — a thrown Error, not an AssertionError, so the
 *   classifier reports CORRUPT PROOF → replay red. If the spawn itself
 *   failed (no node binary), the same marker fires from the spawn check.
 * - N1 (no-bug neighbor, must NOT trip the proof): keep reporting but
 *   relabel the finding (`'relabelled/' + entry.name`). OBSERVED: the
 *   guard still exits 1, the proof STAYS red — the defect (silence) is not
 *   restored, so the neighbor does not turn the proof green.
 *
 * Every attempt that restores the silence makes the kept-red proof PASS
 * (or fail as CORRUPT), so the inverted replay goes red. The one attempt
 * that does not restore the defect (N1) leaves the proof red as intended.
 * No mutation was found that both restores the defect AND keeps the replay
 * green.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path, { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

// apps/front/tests/proofs/1891/<this file> -> monorepo root via dirname + 5 hops.
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
	'packages/scripts-ts/src/check-no-subdir-dockerignore.ts',
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
 * Build the fixture: a repo root with the legitimate root `.dockerignore`
 * and ONE subdirectory `.dockerignore` at `apps/api/` — the exact shape the
 * guard must report. No git repo is needed (this guard does not consult
 * git), but `git init` keeps the fixture identical in shape to the 1977
 * proof and costs nothing.
 */
const buildFixture = async (): Promise<string> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-proof-1891-'));
	execFileSync('git', ['init', '-q'], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: 'ignore',
	});
	await writeFixtureFile(rootDir, '.dockerignore', 'node_modules\n');
	await writeFixtureFile(rootDir, 'apps/api/.dockerignore', 'node_modules\n');
	return rootDir;
};

/** Run the subdir guard CLI over the fixture root. */
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
	const GUARD_RED_BANNER =
		'Found .dockerignore file(s) outside the repository root (#1891):';

	if (code !== 0 && !output.includes(GUARD_RED_BANNER)) {
		// A nonzero exit WITHOUT the guard's own red banner is a crash or a
		// scan failure, not a finding. Classify as measurement impossible —
		// never as a kept-red.
		throw new Error(
			`MESURE IMPOSSIBLE — guard exited ${code} without naming a subdirectory .dockerignore: ${output}`,
		);
	}
	return { code, output };
};

test('RED: a subdirectory .dockerignore is not detected by any guard (undetected, issue #1891)', async () => {
	const fixture = await buildFixture();
	try {
		const { code, output } = runGuard(fixture);

		// BUGGY condition (asserted): the guard says NOTHING about
		// apps/api/.dockerignore. On corrected code the guard names it and
		// exits 1 — so `expect(code).toBe(0)` FAILS, the kept-red state.
		// When it passes (a re-introduced bug), the secondary assertion
		// passes too, so the replay step turns red with "proof test passed
		// unexpectedly".
		expect(code).toBe(0);

		// When the guard DOES red (manual red-state verification, or a
		// future variant that reds for the wrong reason), the red must name
		// the subdirectory .dockerignore — never an unrelated failure.
		if (code !== 0) {
			expect(output).toContain('apps/api/.dockerignore');
		}
	} finally {
		await rm(fixture, { recursive: true, force: true });
	}
}, 60_000);
