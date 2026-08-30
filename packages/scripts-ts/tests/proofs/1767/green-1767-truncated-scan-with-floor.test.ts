/**
 * @vitest-environment node
 *
 * GREEN TEST — issue #1767, proof 2 of 2.
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
 * to set `files_scanned_floor: 1000` — the CORRECT state.
 *
 * ## What the proof asserts (green direction)
 *
 * The proof asserts the CORRECT outcome: the ratchet FAILS CLOSED
 * (withinLimit="error") because the scan is truncated.
 *
 * ## Replay
 *   cd packages/scripts-ts && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1767/green-1767-truncated-scan-with-floor.test.ts
 *
 * Expected: PASS — the floor is 1000, the scan covers 300, the ratchet
 * fails closed.
 */
import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

import { checkNoFloatingPromises } from '../../../src/check-no-floating-promises.ts';

const TRUNCATED_FILE_COUNT = 300;
const FULL_BASELINE_COUNT = 397;
const FLOOR = 1000;

test(
	'GREEN: with the floor, a truncated scan fails closed',
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

		// Mock baseline with floor=1000 (CORRECT state).
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
								files_scanned_floor: FLOOR,
							}),
						);
					}
					return actual.readFile(filePath, encoding);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('../../../src/check-no-floating-promises.ts?1767-green');

		try {
			const result = await mockedCheck();

			// CORRECT condition: with floor=1000, truncated scan fails closed.
			assert.strictEqual(
				result.withinLimit,
				'error',
				'GREEN proof: with a valid floor, a truncated scan must fail closed',
			);
		} finally {
			vi.doUnmock('node:child_process');
			vi.doUnmock('node:fs/promises');
		}
	},
);
