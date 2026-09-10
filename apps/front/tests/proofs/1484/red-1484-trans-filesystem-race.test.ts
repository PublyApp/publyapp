/**
 * @vitest-environment jsdom
 *
 * KEPT RED PROOF — issue #1484, translation reader path.
 *
 * This proof deliberately asserts the unfixed behavior: the real
 * discoverTransCallSites enumerates a real temporary routes fixture, the
 * readSourceFile seam deletes the target file, and the real read must
 * propagate ENOENT. The corrected scanner recovers from that race, so this
 * assertion fails on the corrected code and the paired-proof runner accepts
 * that assertion failure.
 *
 * Primary mutation: in
 * apps/front/src/lib/i18n/trans-render.guard.test.tsx, make its isEnoent
 * classifier always return false. The named assertion then passes because
 * ENOENT propagates.
 *
 * Adverse-mutation search — no surviving mutation:
 * 1. Translation isEnoent => false: caught by this exact named test; it
 *    passes under the mutation instead of staying red.
 * 2. Drawer stat classification changed from isEnoent(error) to false:
 *    caught by the companion `drawer scanner propagates the unfixed ENOENT
 *    race` test; it passes under the mutation instead of staying red.
 * 3. Drawer isEnoent => false: caught by that same named drawer test; it
 *    passes under the mutation instead of staying red.
 *
 * Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1484/red-1484-trans-filesystem-race.test.ts
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { discoverTransCallSites } from '../../../src/lib/i18n/trans-render.guard.test';

const isEnoent = (error: unknown): boolean =>
	error instanceof Error && 'code' in error && error.code === 'ENOENT';

describe('translation filesystem race kept-red proof (#1484)', () => {
	it('translation scanner propagates the unfixed ENOENT race', () => {
		const directory = mkdtempSync(path.join(tmpdir(), 'publy-1484-proof-'));
		const filePath = path.join(
			directory,
			'routes',
			'_trans-disappearing-kept-red-proof.tsx',
		);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(
			filePath,
			[
				"import { Trans } from 'react-i18next';",
				'',
				'export function DisappearingKeptRedProof() {',
				'\treturn <Trans i18nKey="auth.proof" ns="auth">x</Trans>;',
				'}',
			].join('\n') + '\n',
		);
		let deletedDuringRead = false;
		let thrown: unknown;

		try {
			try {
				discoverTransCallSites({
					additionalRoots: [directory],
					readSourceFile: (scannedPath) => {
						if (scannedPath === filePath) {
							unlinkSync(scannedPath);
							deletedDuringRead = true;
						}
						return readFileSync(scannedPath, 'utf8');
					},
				});
			} catch (error) {
				thrown = error;
			}

			expect(deletedDuringRead).toBe(true);
			expect(isEnoent(thrown)).toBe(true);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
