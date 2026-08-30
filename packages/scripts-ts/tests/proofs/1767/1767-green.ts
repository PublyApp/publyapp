/**
 * Paire de preuves pour l'issue #1767 — plancher de fichiers balayés.
 *
 * Preuve verte (1767-green.ts) : AVEC le plancher, un balayage tronqué echoue.
 *
 * Convention : docs/guides/test-conventions.md §"Paired Red/Green Proofs".
 */

import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

const TRUNCATED_FILE_COUNT = 300;
const FULL_BASELINE_COUNT = 397;
const FLOOR = 1000;

test(
	'#1767 GREEN — with the floor, a truncated scan fails closed',
	{ timeout: 30_000 },
	async () => {
		// Mock oxlint pour simuler un balayage tronqué : 300 fichiers au lieu
		// de 1122, avec un compte de warnings DANS les limites du plancher.
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

		// Mock le baseline AVEC un plancher valide.
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
			await import('../../src/check-no-floating-promises.ts?1767-green');

		try {
			const result = await mockedCheck();

			// AVEC le plancher, le balayage tronqué echoue.
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
