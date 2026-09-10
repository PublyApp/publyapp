/**
 * @vitest-environment jsdom
 *
 * KEPT RED PROOF — issue #1484, drawer scanner victim.
 *
 * This proof deliberately asserts the unfixed behavior across both real
 * scanner race windows. The pre-stat case uses beforeStat to delete the
 * enumerated fixture before the real stat; the post-stat case uses
 * beforeReadSourceFile to delete it after stat succeeds and before the real
 * readFileSync. The corrected scanner recovers from both races, so both
 * assertions fail on corrected code and the paired-proof runner accepts those
 * assertion failures.
 *
 * Primary mutation: in
 * apps/front/src/components/ui/drawer-form.test.tsx, change the readFileSync
 * catch's `if (isEnoent(error))` to `if (false)`. The post-stat named
 * assertion then passes because ENOENT propagates.
 *
 * Adverse-mutation search — scoped to these two declared drawer race windows;
 * this proof does not claim an exhaustive mutation search over the whole
 * scanner:
 * 1. Drawer isEnoent => false: both named drawer tests pass under the
 *    mutation instead of staying red.
 * 2. Change the drawer stat catch from `isEnoent(error)` to `false`: the
 *    pre-stat named test passes instead of staying red.
 * 3. Change the drawer read catch from `isEnoent(error)` to `false`: the
 *    post-stat named test passes instead of staying red.
 *
 * The other independent drawer ENOENT catches are the recursive
 * `readDirectoryEntries` catch at drawer-form.test.tsx:5117 and the
 * `refreshFromFileSystemSync` catch at drawer-form.test.tsx:5302. They are
 * covered by ordinary green regression tests named:
 * `skips a fixture directory deleted before recursive readdir (#1484)` and
 * `ignores an already-tracked fixture deleted before
 * refreshFromFileSystemSync (#1484)`. No other ENOENT catch was found in
 * drawer-form.test.tsx. The translation mutation belongs to the companion
 * translation kept-red proof.
 *
 * Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1484/red-1484-drawer-filesystem-race.test.ts
 */
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
	DRAWER_RACE_PROOF_FIXTURE,
	scanDrawerSurfaces,
} from '../../../src/components/ui/drawer-form.test';

const isEnoent = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

describe('drawer filesystem race kept-red proof (#1484)', () => {
	it('drawer scanner propagates the unfixed pre-stat ENOENT race', () => {
		writeFileSync(
			DRAWER_RACE_PROOF_FIXTURE.filePath,
			DRAWER_RACE_PROOF_FIXTURE.source,
		);
		let deletedDuringScan = false;
		let thrown: unknown;

		try {
			try {
				scanDrawerSurfaces({
					beforeStat: (filePath) => {
						if (filePath !== DRAWER_RACE_PROOF_FIXTURE.filePath) {
							return;
						}
						unlinkSync(filePath);
						deletedDuringScan = true;
					},
				});
			} catch (error) {
				thrown = error;
			}

			expect(deletedDuringScan).toBe(true);
			expect(isEnoent(thrown)).toBe(true);
		} finally {
			if (existsSync(DRAWER_RACE_PROOF_FIXTURE.filePath)) {
				unlinkSync(DRAWER_RACE_PROOF_FIXTURE.filePath);
			}
		}
	});

	it('drawer scanner propagates the unfixed post-stat ENOENT race', () => {
		writeFileSync(
			DRAWER_RACE_PROOF_FIXTURE.filePath,
			DRAWER_RACE_PROOF_FIXTURE.source,
		);
		let deletedDuringScan = false;
		let thrown: unknown;

		try {
			try {
				scanDrawerSurfaces({
					beforeReadSourceFile: (filePath) => {
						if (filePath !== DRAWER_RACE_PROOF_FIXTURE.filePath) {
							return;
						}
						unlinkSync(filePath);
						deletedDuringScan = true;
					},
				});
			} catch (error) {
				thrown = error;
			}

			expect(deletedDuringScan).toBe(true);
			expect(isEnoent(thrown)).toBe(true);
		} finally {
			if (existsSync(DRAWER_RACE_PROOF_FIXTURE.filePath)) {
				unlinkSync(DRAWER_RACE_PROOF_FIXTURE.filePath);
			}
		}
	});
});
