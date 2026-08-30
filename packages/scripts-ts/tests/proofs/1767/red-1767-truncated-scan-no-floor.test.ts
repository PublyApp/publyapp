/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1767, proof 1 of 2.
 *
 * ## Context
 *
 * Issue #1767: a scan that covers only a fraction of the repo's files can
 * still produce a warning count within the baseline (fewer files → fewer
 * warnings), so a truncated scan would report "within limit" while real
 * violations hide in the unscanned files.
 *
 * The fix: the baseline pins `files_scanned_floor` (1000). If oxlint scans
 * fewer files than the floor, the scan is truncated and the ratchet
 * refuses to report a count — it fails closed.
 *
 * This proof mocks oxlint to scan 300 files (vs 1122 measured) with a
 * warning count equal to the baseline (397). The baseline JSON is mocked
 * to set `files_scanned_floor: 0` — the ADVERSE MUTATION (floor disabled).
 *
 * ## What the proof asserts (kept-red direction)
 *
 * The proof asserts the BUGGY outcome: the ratchet PASSES (withinLimit=true)
 * with this mutation applied, i.e. the truncated scan is invisible because
 * the floor is disabled.
 *
 * - CORRECTED code: the floor is positive, the truncated scan fails closed
 *   (withinLimit="error"). `expect(result.withinLimit).toBe(true)` FAILS as
 *   an AssertionError — the kept-red state the *Verify paired red proofs*
 *   step replays with inverted semantics.
 * - BUG re-introduced (floor removed or zeroed): withinLimit=true → the
 *   assertion PASSES → the replay step turns red with "proof test passed
 *   unexpectedly" — the stale-proof signal.
 *
 * ## Adverse mutations (trace — two attempts)
 *
 * - C1: mock oxlint to scan 0 files instead of 300. CAUGHT: the existing
 *   `number_of_files === 0` guard trips first, so the proof would exercise
 *   the wrong guard. The proof scans 300 (above 0, below 1000) to exercise
 *   the floor guard specifically.
 * - C2: omit the floor from the baseline JSON entirely. CAUGHT: the new
 *   validation `typeof baseline.files_scanned_floor !== 'number'` trips and
 *   fails closed — the proof would pass for the wrong reason (validation
 *   guard, not floor guard). The proof sets floor=0 to exercise the floor
 *   guard itself.
 *
 * ## Replay
 *   cd packages/scripts-ts && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1767/red-1767-truncated-scan-no-floor.test.ts
 *
 * Expected: FAIL — on corrected code the floor is 1000, so the truncated
 * scan fails closed and `expect(result.withinLimit).toBe(true)` fails.
 *
 * ## Mutation to introduce the red (restore the bug)
 *   Remove the floor validation and the floor guard from
 *   check-no-floating-promises.ts, and re-run the replay: the ratchet then
 *   returns withinLimit=true and this proof PASSES, reddening the replay
 *   step.
 */
import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

import { checkNoFloatingPromises } from '../../../src/check-no-floating-promises.ts';

const TRUNCATED_FILE_COUNT = 300;
const FULL_BASELINE_COUNT = 397;

test(
	'RED: without the floor, a truncated scan passes green (buggy)',
	{ timeout: 30_000 },
	async () => {
		// Mock oxlint: truncated scan (300 files) with full baseline warnings.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 1,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: FULL_BASELINE_COUNT }, () => ({
							message: 'Promises must be awaited',
							code: 'typescript(no-floating-promises)',
							severity: 'warning',
						})),
						number_of_files: TRUNCATED_FILE_COUNT,
					}),
					stderr: '',
					error: null,
				}),
			};
		});

		// Mock baseline with floor=0 (ADVERSE MUTATION).
		vi.doMock('node:fs/promises', async (importOriginal) => {
			const actual = await importOriginal<typeof import('node:fs/promises')>();
			return {
				...actual,
				readFile: (filePath: string, encoding: string) => {
					if (
						typeof filePath === 'string' &&
						filePath.includes('no-floating-promises-baseline.json')
					) {
						return Promise.resolve(
							JSON.stringify({
								rule: 'typescript(no-floating-promises)',
								count: FULL_BASELINE_COUNT,
								files_scanned_floor: 0, // ADVERSE MUTATION
							}),
						);
					}
					return actual.readFile(filePath, encoding);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('../../../src/check-no-floating-promises.ts?1767-red');

		try {
			const result = await mockedCheck();

			// BUGGY condition (asserted): with floor=0, truncated scan passes green.
			assert.strictEqual(
				result.withinLimit,
				true,
				'RED proof: with floor=0, a truncated scan passes green — ' +
					'the bug this ratchet exists to prevent',
			);
			assert.strictEqual(result.actual, FULL_BASELINE_COUNT);
		} finally {
			vi.doUnmock('node:child_process');
			vi.doUnmock('node:fs/promises');
		}
	},
);
