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
 * Adverse-mutation search — no surviving mutation after both windows were
 * exercised:
 * 1. Drawer isEnoent => false: both named drawer tests pass under the
 *    mutation instead of staying red.
 * 2. Change the drawer stat catch from `isEnoent(error)` to `false`: the
 *    pre-stat named test passes instead of staying red.
 * 3. Change the drawer read catch from `isEnoent(error)` to `false`: the
 *    post-stat named test passes instead of staying red.
 * 4. Translation isEnoent => false: the companion
 *    `translation scanner propagates the unfixed ENOENT race` test passes
 *    instead of staying red.
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
