import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

const { checkNoFloatingPromises } = await import(
	`./check-${'no' + '-floating-promises.ts'}`
);

test(
	'the no-floating-promises count stays within the pinned baseline',
	{ timeout: 30_000 },
	async () => {
		const result = await checkNoFloatingPromises();

		assert.ok(
			result.withinLimit,
			`${result.rule}: ${result.actual} exceeds baseline ${result.baseline} — ` +
				'ratchet tripped (issue #1679). Fix the new warnings or lower the baseline deliberately.',
		);
	},
);

test(
	'the ratchet FAILS CLOSED when the oxlint binary is missing',
	{ timeout: 30_000 },
	async () => {
		// Mock node:fs so existsSync returns false ONLY for the oxlint
		// binary path. This directly exercises the binary's fail-closed
		// guard — if the mock leaks or the guard is bypassed, the test
		// fails loud.
		vi.doMock('node:fs', async (importOriginal) => {
			const actual = await importOriginal<typeof import('node:fs')>();
			return {
				...actual,
				existsSync: (filePath: string) => {
					if (typeof filePath === 'string' && filePath.endsWith('oxlint')) {
						return false;
					}
					return actual.existsSync(filePath);
				},
			};
		});

		// Re-import the binary so it picks up the mocked node:fs.
		const { checkNoFloatingPromises: mockedCheck } = await import(
			`./check-${'no' + '-floating-promises.ts'}?mocked`
		);

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected the ratchet to return withinLimit="error" when oxlint is missing, ' +
					'but it did not — the fail-closed guard failed',
			);
		} finally {
			vi.doUnmock('node:fs');
		}
	},
);
