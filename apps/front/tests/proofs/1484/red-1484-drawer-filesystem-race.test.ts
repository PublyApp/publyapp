/**
 * @vitest-environment jsdom
 *
 * KEPT RED PROOF — issue #1484, drawer scanner victim.
 *
 * This proof deliberately asserts the unfixed behavior: the real
 * scanDrawerSurfaces enumerates its fixture directory, the beforeStat seam
 * deletes the target file, and the real stat must propagate ENOENT. The
 * corrected scanner recovers from that race, so this assertion fails on the
 * corrected code and the paired-proof runner accepts that assertion failure.
 *
 * Primary mutation: in
 * apps/front/src/components/ui/drawer-form.test.tsx, change its isEnoent
 * classifier to `const isEnoent = (_error: unknown): boolean => false;`.
 * The named assertion then passes because ENOENT propagates.
 *
 * Adverse-mutation search — no surviving mutation:
 * 1. Drawer isEnoent => false: caught by this exact named test; it passes
 *    under the mutation instead of staying red.
 * 2. Change the drawer stat catch from `isEnoent(error)` to `false`: caught
 *    by this same named test on the same enumerate-delete-stat path.
 * 3. Translation isEnoent => false: caught by the companion
 *    `translation scanner propagates the unfixed ENOENT race` test; it passes
 *    under the mutation instead of staying red.
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
	it('drawer scanner propagates the unfixed ENOENT race', () => {
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
});
