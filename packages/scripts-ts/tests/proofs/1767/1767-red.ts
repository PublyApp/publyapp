/**
 * Paire de preuves pour l'issue #1767 — plancher de fichiers balayés.
 *
 * PROUVE : un balayage tronqué (oxlint ne couvrant qu'une fraction des
 * fichiers du depot) peut encore produire un compte de warnings dans les
 * limites du plancher, et donc passer au vert — le faux negatif silencieux
 * que ce cliquet existe pour empecher.
 *
 * Preuve rouge (1767-red.ts) : SANS le plancher, un balayage tronqué passe au vert.
 * Preuve verte (1767-green.ts) : AVEC le plancher, un balayage tronqué echoue.
 *
 * La preuve rouge ne peut pas rester dans la suite principale — par construction,
 * elle echoue contre le code corrige. Elle vit ici, sous tests/proofs/1767/,
 * avec la mutation adverse qui la reproduit.
 *
 * Convention : docs/guides/test-conventions.md §"Paired Red/Green Proofs".
 */

import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

// La mutation adverse : plancher desactive (0). Avec un plancher de 0,
// tout balayage est considere complet — un balayage tronqué qui ne couvre
// que 300 fichiers (sur 1122) passerait au vert avec un compte de warnings
// dans les limites.
const TRUNCATED_FILE_COUNT = 300;
const FULL_BASELINE_COUNT = 397;

test(
	'#1767 RED — without the floor, a truncated scan passes green',
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

		// Mock le baseline AVEC un plancher de 0 (mutation adverse).
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
								files_scanned_floor: 0, // MUTATION ADVERSE
							}),
						);
					}
					return actual.readFile(filePath, encoding);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('../../src/check-no-floating-promises.ts?1767-red');

		try {
			const result = await mockedCheck();

			// AVEC le plancher de 0, le balayage tronqué passe au vert.
			// C'est le bug : le compte est dans les limites, donc withinLimit=true.
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
