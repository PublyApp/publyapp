import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

import { checkNoFloatingPromises } from './check-no-floating-promises.ts';
import baseline from './no-floating-promises-baseline.json' with { type: 'json' };

// Les tests qui simulent un DEPASSEMENT doivent produire un compte superieur a
// la base reellement epinglee, pas a un nombre ecrit en dur. Un `1` code en dur
// ne depasse la base que tant qu'elle vaut 0 : le jour ou elle change, le test
// passe au vert en n'exercant plus rien du tout — le faux negatif silencieux
// que ce cliquet existe justement pour empecher.
const overBaseline = baseline.count + 1;

test(
	'the no-floating-promises count stays within the pinned baseline',
	{ timeout: 120_000 },
	async () => {
		// This is a REAL test — it runs the actual oxlint binary against the
		// entire repo and counts typescript(no-floating-promises) warnings.
		// Not mocked, not stubbed. The oxlint binary path is resolved from
		// node_modules at runtime in check-no-floating-promises.ts.
		const result = await checkNoFloatingPromises();

		// This asserts the ratchet direction only: the count must not rise
		// above the pinned baseline. It deliberately does NOT pin an exact
		// count, because the warnings are not yet fixed — the baseline is
		// still 400 and lowering it is the job tracked by issue #1679.
		// Pinning `actual === 0` here would be a test that asserts a state
		// the repository is not in, and it would go red on a tree that is
		// perfectly correct for today.
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
		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked');

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

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-empty');

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

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-garbled');

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

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-truncated');

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
	'the ratchet FAILS CLOSED when oxlint exits with status 2 (config error)',
	{ timeout: 30_000 },
	async () => {
		// Mock spawnSync to return exit code 2 (config error). oxlint's config
		// error means the scan did not run — output is unreliable and we must
		// fail-closed even though stdout contains JSON.
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

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-config-error');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when oxlint exits with config error (status 2), ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet COUNTS warnings when oxlint exits with status 1 (lint problems found)',
	{ timeout: 30_000 },
	async () => {
		// oxlint exit code 1 means it found lint problems (errors and/or warnings).
		// This is NORMAL — the JSON output is still valid and parseable. The repo
		// has 34 typescript(no-deprecated) errors that cause exit code 1, but the
		// floating-promises warnings in the JSON are counted correctly.
		// The ratchet must NOT fail-closed here — it must count and compare.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 1,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: overBaseline }, () => ({
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

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-exit1-problems');

		try {
			const result = await mockedCheck();

			// Must NOT be 'error' — exit code 1 with valid JSON is normal.
			assert.notStrictEqual(
				result.withinLimit,
				'error',
				'expected the ratchet to count warnings (not fail-closed) when oxlint exits 1 with valid JSON, ' +
					`but got withinLimit="error"`,
			);
			// One warning MORE than the pinned baseline — must be false.
			assert.strictEqual(
				result.withinLimit,
				false,
				`expected withinLimit=false when the count (${overBaseline}) exceeds ` +
					`baseline ${baseline.count}, but got withinLimit=${result.withinLimit}`,
			);
			assert.strictEqual(result.actual, overBaseline);
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

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-zero-files');

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
	'the ratchet PASSES when oxlint returns valid JSON with zero warnings',
	{ timeout: 30_000 },
	async () => {
		// This is the only case that should pass green: valid JSON, files
		// scanned, and a zero warning count — which is within any baseline.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: JSON.stringify({
						diagnostics: [],
						number_of_files: 1000,
					}),
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-valid');

		try {
			const result = await mockedCheck();

			assert.strictEqual(result.withinLimit, true);
			assert.strictEqual(result.actual, 0);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when the pinned rule name matches no emitted code',
	{ timeout: 30_000 },
	async () => {
		// The counter compares the pinned rule name to `diagnostic.code` by
		// exact string equality. A name that matches nothing counts zero, and
		// zero is within any baseline — so the gate would stay green forever
		// while the real warnings pile up. This is the failure the reviewer of
		// round 4 demonstrated with the slash form of the rule name.
		//
		// Here oxlint emits real diagnostics, none of which carries the pinned
		// name. The guard must refuse to report a count rather than return 0.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 1,
					stdout: JSON.stringify({
						diagnostics: [
							{
								message: 'Something else entirely',
								code: 'typescript(no-deprecated)',
								severity: 'error',
							},
							{
								message: 'Promises must be awaited',
								// The slash form — NOT what oxlint emits, and
								// exactly the typo that would go unnoticed.
								code: 'typescript/no-floating-promises',
								severity: 'warning',
							},
						],
						number_of_files: 1000,
					}),
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-dead-rule-name');

		try {
			const result = await mockedCheck();

			// MUST fail closed — never a conforming 0.
			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected the ratchet to fail closed when the pinned rule name ' +
					`matches no emitted code, but got withinLimit=${result.withinLimit}`,
			);
			// The distinction that matters is withinLimit: on the fail-closed
			// path `actual` is 0 because nothing was counted, but that 0 is
			// reported as an ERROR, never as "within limit". The bug this
			// covers is precisely a 0 dressed up as a pass — assert that the
			// pass never happens.
			assert.notStrictEqual(
				result.withinLimit,
				true,
				'a count of 0 reported as "within limit" would be a conforming ' +
					'default produced from input the guard could not evaluate — ' +
					'the exact silent false negative this ratchet exists to prevent',
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS (withinLimit=false) when the count exceeds the baseline',
	{ timeout: 30_000 },
	async () => {
		// The ratchet must return withinLimit=false (and the binary must exit
		// nonzero) when the warning count rises above the pinned baseline.
		// A test that only asserts `result.withinLimit` is trivially satisfied
		// by `true` — this test asserts the EXACT negation: false, not "error".
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 1,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: overBaseline }, () => ({
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

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-over-baseline');

		try {
			const result = await mockedCheck();

			// MUST be boolean false — not "error", not undefined, not null.
			assert.strictEqual(
				result.withinLimit,
				false,
				'expected withinLimit=false when count exceeds baseline, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
			// The actual count must be reported accurately.
			assert.strictEqual(result.actual, overBaseline);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when the baseline file is missing',
	{ timeout: 30_000 },
	async () => {
		// If no-floating-promises-baseline.json does not exist, readFile
		// throws ENOENT, which the catch converts to withinLimit="error".
		vi.doMock('node:fs/promises', async (importOriginal) => {
			const actual = await importOriginal<typeof import('node:fs/promises')>();
			return {
				...actual,
				readFile: async () => {
					throw new Error(
						"ENOENT: no such file or directory, open 'no-floating-promises-baseline.json'",
					);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-missing-baseline');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when baseline file is missing, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when the baseline file is unreadable',
	{ timeout: 30_000 },
	async () => {
		// Permission denied on the baseline file — also withinLimit="error".
		vi.doMock('node:fs/promises', async (importOriginal) => {
			const actual = await importOriginal<typeof import('node:fs/promises')>();
			return {
				...actual,
				readFile: async () => {
					throw new Error('EACCES: permission denied');
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-unreadable-baseline');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when baseline file is unreadable, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when the baseline JSON is missing the count key',
	{ timeout: 30_000 },
	async () => {
		// Baseline file exists and is valid JSON but has no `count` field.
		// JSON.parse succeeds, but baseline.count is undefined, so the
		// comparison `actualCount <= baseline.count` yields false (NaN-like).
		// The catch converts this to withinLimit="error".
		vi.doMock('node:fs/promises', async (importOriginal) => {
			const actual = await importOriginal<typeof import('node:fs/promises')>();
			return {
				...actual,
				readFile: async () =>
					JSON.stringify({
						rule: 'typescript(no-floating-promises)',
						// count is intentionally missing
					}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-missing-count');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when baseline is missing count key, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when the baseline count is non-numeric',
	{ timeout: 30_000 },
	async () => {
		// Baseline file has count as a string "400" instead of number 400.
		// The comparison `actualCount <= "400"` would be false (string compare),
		// so the ratchet must fail closed rather than silently pass.
		vi.doMock('node:fs/promises', async (importOriginal) => {
			const actual = await importOriginal<typeof import('node:fs/promises')>();
			return {
				...actual,
				readFile: async () =>
					JSON.stringify({
						rule: 'typescript(no-floating-promises)',
						count: '400', // string, not number
					}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-string-count');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when baseline count is non-numeric, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when the baseline JSON is malformed',
	{ timeout: 30_000 },
	async () => {
		// The baseline file contains invalid JSON. JSON.parse throws,
		// which the catch converts to withinLimit="error".
		vi.doMock('node:fs/promises', async (importOriginal) => {
			const actual = await importOriginal<typeof import('node:fs/promises')>();
			return {
				...actual,
				readFile: async () => '{ "rule": "broken", ',
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-malformed-baseline');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when baseline JSON is malformed, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);
