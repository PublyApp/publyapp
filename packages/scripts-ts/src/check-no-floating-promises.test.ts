import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

const { checkNoFloatingPromises } = await import(
	`./check-${'no' + '-floating-promises.ts'}`
);

test(
	'the no-floating-promises count stays within the pinned baseline',
	{ timeout: 120_000 },
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

test(
	'the ratchet FAILS CLOSED when oxlint produces empty output',
	{ timeout: 30_000 },
	async () => {
		// Mock node:child_process so spawnSync returns status=0 but an empty
		// stdout. Empty output must NOT count as "0 warnings, within limit" —
		// it is a broken scan. The ratchet must return withinLimit="error".
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: '',
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } = await import(
			`./check-${'no' + '-floating-promises.ts'}?mocked-empty`
		);

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when oxlint output is empty, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when oxlint produces garbled (non-JSON) output',
	{ timeout: 30_000 },
	async () => {
		// Mock spawnSync to return garbled text that is not valid JSON.
		// The ratchet must throw during JSON.parse and return withinLimit="error".
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: 'garbled output with no markers whatsoever',
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } = await import(
			`./check-${'no' + '-floating-promises.ts'}?mocked-garbled`
		);

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when oxlint output is not JSON, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when oxlint produces truncated JSON',
	{ timeout: 30_000 },
	async () => {
		// Mock spawnSync to return a JSON object that opens but never closes.
		// JSON.parse will fail on truncated input — the ratchet must catch
		// that and return withinLimit="error".
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout:
						'{ "diagnostics": [ { "code": "typescript(no-floating-promises)"',
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } = await import(
			`./check-${'no' + '-floating-promises.ts'}?mocked-truncated`
		);

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when oxlint output is truncated JSON, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when oxlint exits with non-zero status',
	{ timeout: 30_000 },
	async () => {
		// Mock spawnSync to return a non-zero exit status. Even if the stdout
		// contains valid-looking JSON, a non-zero exit means oxlint itself
		// failed — we cannot trust the output.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 2,
					stdout: '{ "diagnostics": [], "number_of_files": 100 }',
					stderr: 'oxlint: config error',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } = await import(
			`./check-${'no' + '-floating-promises.ts'}?mocked-exit2`
		);

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when oxlint exits non-zero, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when oxlint scans zero files',
	{ timeout: 30_000 },
	async () => {
		// Valid JSON, zero diagnostics, but number_of_files is 0. A broken
		// config or ignore-everything scenario must not pass green.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: '{ "diagnostics": [], "number_of_files": 0 }',
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } = await import(
			`./check-${'no' + '-floating-promises.ts'}?mocked-zero-files`
		);

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when oxlint scans 0 files, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet PASSES when oxlint returns valid JSON with a real count within limit',
	{ timeout: 30_000 },
	async () => {
		// This is the only case that should pass green: valid JSON, files
		// scanned, a real warning count that is within the pinned baseline.
		// The baseline is 400 (pinned in no-floating-promises-baseline.json).
		// We mock 5 warnings — well within the 400 limit.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: 5 }, () => ({
							message: 'Promises must be awaited',
							code: 'typescript(no-floating-promises)',
							severity: 'warning',
						})),
						number_of_files: 1000,
					}),
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } = await import(
			`./check-${'no' + '-floating-promises.ts'}?mocked-valid`
		);

		try {
			const result = await mockedCheck();

			assert.strictEqual(result.withinLimit, true);
			assert.strictEqual(result.actual, 5);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);
