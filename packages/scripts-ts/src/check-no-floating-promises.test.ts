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
// compte STRICTEMENT INFERIEUR au plancher epine — simule un nettoyage non
// capitalise dans le plancher.
const underBaseline = baseline.count - 1;
// Nombre de fichiers strictement INFERIEUR au plancher epine — simule un
// balayage tronqué (issue #1767). Un balayage qui ne couvre qu'une fraction
// des fichiers du depot peut encore produire un compte de warnings dans les
// limites du plancher (moins de fichiers → moins de warnings). Le cliquet
// doit refuser un tel balayage.
const underFloor = baseline.files_scanned_floor - 1;

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
		// This is NORMAL — the JSON output is still valid and parseable, and the
		// floating-promises warnings in it are counted correctly. (On this tree
		// oxlint actually exits 0 today; status 1 is the case where some rule is
		// configured as an error, which must not break the count.)
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
	'the ratchet FAILS CLOSED on an empty scan while the baseline records debt',
	{ timeout: 30_000 },
	async () => {
		// Zero diagnostics with files scanned USED to pass green as "0 is
		// within any baseline". That is only true for a repository that
		// genuinely has none. With a baseline recording 400 violations, an
		// empty scan means the scan broke (a config that ignores every TS
		// file, a changed invocation) — not that the debt vanished overnight.
		// Reported as a pass, it would keep this gate green forever.
		//
		// The day the debt really reaches zero, the fix is one deliberate edit
		// to `count` in the baseline file, which the error message names.
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

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" on an empty scan against a non-zero ' +
					`baseline, but got withinLimit=${result.withinLimit}`,
			);
			assert.notStrictEqual(
				result.withinLimit,
				true,
				'a 0 from an empty scan reported as "within limit" is the silent ' +
					'false negative this ratchet exists to prevent',
			);
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

test(
	'the ratchet COUNTS the pinned rule when oxlint emits it at severity "error"',
	{ timeout: 30_000 },
	async () => {
		// The counter used to require `severity === 'warning'`. That opened a
		// blind spot the dead-rule guard could not see: with the rule emitted
		// as `error`, its code IS among the emitted codes (so the dead-rule
		// guard stays silent) while the count sits at 0 — a green gate over
		// any number of real violations. Raising a rule from warning to error
		// is a routine config change, so this was one edit away at all times.
		//
		// This is the exact mutation round 5 named. It must be counted, not
		// ignored: an escalated rule is strictly worse, never invisible.
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
							// The mutation: error, not warning.
							severity: 'error',
						})),
						number_of_files: 1000,
					}),
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-severity-error');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.actual,
				overBaseline,
				`expected all ${overBaseline} diagnostics to be counted regardless of ` +
					`severity, but got actual=${result.actual} — a severity filter is ` +
					'blinding the ratchet',
			);
			assert.strictEqual(
				result.withinLimit,
				false,
				'expected withinLimit=false when the count exceeds the baseline, ' +
					`but got withinLimit=${result.withinLimit}`,
			);
			assert.notStrictEqual(
				result.withinLimit,
				true,
				'counting 0 because the rule was escalated to `error` would report ' +
					'a green gate over real violations',
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

// ---------------------------------------------------------------------------
// Issue #1727: floor-stale detection
//
// Three tests covering every comparison direction between the real count and
// the pinned baseline:
//   1. count > floor  → regression (existing behaviour, message unchanged)
//   2. count < floor  → stale floor (NEW: fails, message names the exact value)
//   3. count == floor  → green
//
// The stale-floor tests also verify the MESSAGE content — the brief requires
// the failure message to name the exact value to write and explain why
// tightening is not automatic. `run()` is exported precisely so these tests
// can assert on the console output.

test(
	'the ratchet FAILS (regression) when the count exceeds the floor (count > floor)',
	{ timeout: 30_000 },
	async () => {
		// count = floor + 1 → regression. withinLimit must be `false` (the
		// existing regression path), with the unchanged message that names
		// the offending number and the pinned baseline.
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
			await import('./check-no-floating-promises.ts?test-regression-over');

		try {
			const result = await mockedCheck();
			// Regression: withinLimit is boolean false, not floor_stale.
			assert.strictEqual(
				result.withinLimit,
				false,
				`expected withinLimit=false for count ${overBaseline} > floor ${baseline.count}, but got ${result.withinLimit}`,
			);
			assert.strictEqual(result.actual, overBaseline);
			// The actual count must exceed, not match, the floor.
			assert.ok(
				result.actual > baseline.count,
				'count must be strictly greater than the floor for a regression',
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS (stale floor) when the count is below the floor (count < floor)',
	{ timeout: 30_000 },
	async () => {
		// count = floor - 1 → stale floor. withinLimit must be 'floor_stale',
		// and the `run()` message must name the exact value to write.
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: underBaseline }, () => ({
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
			await import('./check-no-floating-promises.ts?test-stale-floor');

		try {
			const result = await mockedCheck();
			// Stale floor: withinLimit must be 'floor_stale', not false.
			assert.strictEqual(
				result.withinLimit,
				'floor_stale',
				`expected withinLimit='floor_stale' for count ${underBaseline} < floor ${baseline.count}, but got ${result.withinLimit}`,
			);
			assert.strictEqual(result.actual, underBaseline);
			assert.ok(
				result.actual < baseline.count,
				'count must be strictly less than the floor for a stale-floor',
			);
		} finally {
			vi.doUnmock('node:child_process');
		}

		// Now verify `run()` prints the exact value and explains why it is
		// not automatic. We mock process.exit so run() returns instead of
		// killing the test runner.
		// The exit CODE is the whole product of this branch: CI reads it, not the
		// message. A mock that swallows the code lets `process.exit(1)` become
		// `process.exit(0)` with every test still green — the ratchet would print
		// its warning and let CI pass, reinstating the half-ratchet #1727 exists
		// to remove. So capture the code and assert it below.
		const exitCodes: (number | undefined)[] = [];
		const exitMock = vi
			.spyOn(process, 'exit')
			.mockImplementation((code?: number) => {
				exitCodes.push(code);
				throw new Error('process.exit called');
			});

		// Re-import with a fresh mocked child_process for run().
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: underBaseline }, () => ({
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

		const { run: mockedRun } =
			await import('./check-no-floating-promises.ts?test-stale-floor-run');

		const runErrors: string[] = [];
		const originalRunError = console.error;
		console.error = (...args: unknown[]) => {
			runErrors.push(args.join(' '));
		};

		try {
			await mockedRun();
			// If we get here, run() did not call process.exit — that is a bug.
			assert.fail('run() should have called process.exit(1) for stale floor');
		} catch (e) {
			// Only the sentinel thrown by the exit mock is expected here. Any other
			// error means run() failed for an unrelated reason and the assertions
			// below would be checking nothing.
			assert.ok(
				e instanceof Error && e.message === 'process.exit called',
				`run() threw something other than the exit sentinel: ${String(e)}`,
			);
		} finally {
			console.error = originalRunError;
			exitMock.mockRestore();
			vi.doUnmock('node:child_process');
		}

		// The exit code is what CI acts on: 1 means the gate bites, 0 means it
		// prints a warning and lets the build through.
		assert.deepEqual(
			exitCodes,
			[1],
			`run() must exit with code 1 on a stale floor, got: ${JSON.stringify(exitCodes)}`,
		);

		const joined = runErrors.join('\n');

		// The message must name the exact value to write — `underBaseline`.
		assert.ok(
			joined.includes(`"count": ${underBaseline}`),
			`the floor-stale message must name the exact value to write (expected "${underBaseline}"), got: ${joined}`,
		);

		// The message must explain why tightening is not automatic.
		assert.match(
			joined,
			/not automatic/i,
			'the floor-stale message must explain why tightening is not automatic',
		);

		// The message must reference the issue.
		assert.match(
			joined,
			/#1727/,
			'the floor-stale message must reference issue #1727',
		);
	},
);

test(
	'the ratchet PASSES (green) when the count equals the floor (count == floor)',
	{ timeout: 30_000 },
	async () => {
		// count == baseline exactly → green. withinLimit must be `true`.
		const exactCount = baseline.count;
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 0,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: exactCount }, () => ({
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
			await import('./check-no-floating-promises.ts?test-exact-floor');

		try {
			const result = await mockedCheck();
			assert.strictEqual(
				result.withinLimit,
				true,
				`expected withinLimit=true when count === floor (${exactCount}), but got ${result.withinLimit}`,
			);
			assert.strictEqual(result.actual, exactCount);
			assert.strictEqual(result.actual, baseline.count);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when oxlint scans fewer files than the floor',
	{ timeout: 30_000 },
	async () => {
		// Issue #1767 — truncated scan detection.
		//
		// A scan that covers only a fraction of the repo's files can still
		// produce a warning count within the baseline — fewer files means
		// fewer warnings, so a truncated scan would report "within limit"
		// while real violations hide in the unscanned files. The repo has
		// thousands of TS/TSX files; a scan that covers, say, 300 of them is
		// not the same measurement as the baseline, and comparing the two is
		// meaningless.
		//
		// Here oxlint scans `underFloor` files (one below the pinned floor)
		// and emits a warning count that is WITHIN the baseline. Without the
		// floor, this would pass green — the silent false negative this
		// ratchet exists to prevent. With the floor, the ratchet must refuse
		// to report a count and return withinLimit="error".
		vi.doMock('node:child_process', async (importOriginal) => {
			const actual =
				await importOriginal<typeof import('node:child_process')>();
			return {
				...actual,
				spawnSync: () => ({
					status: 1,
					stdout: JSON.stringify({
						diagnostics: Array.from({ length: baseline.count }, () => ({
							message: 'Promises must be awaited',
							code: 'typescript(no-floating-promises)',
							severity: 'warning',
						})),
						number_of_files: underFloor,
					}),
					stderr: '',
					error: null,
				}),
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-truncated-scan');

		try {
			const result = await mockedCheck();

			// MUST fail closed — never a conforming pass on a truncated scan.
			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when oxlint scans fewer files than ' +
					`the floor (${underFloor} < ${baseline.files_scanned_floor}), ` +
					`but got withinLimit=${result.withinLimit}`,
			);
			// The distinction that matters is withinLimit: the count equals
			// the baseline, but that equality is meaningless when the scan is
			// truncated. The bug this covers is precisely a truncated scan
			// dressed up as a pass — assert that the pass never happens.
			assert.notStrictEqual(
				result.withinLimit,
				true,
				'a truncated scan reported as "within limit" is the silent ' +
					'false negative this ratchet exists to prevent (issue #1767)',
			);
		} finally {
			vi.doUnmock('node:child_process');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when the baseline has no files_scanned_floor',
	{ timeout: 30_000 },
	async () => {
		// Issue #1767 — the floor must be present and valid.
		//
		// A baseline that omits `files_scanned_floor` (or pins a non-positive
		// value) cannot detect a truncated scan. The ratchet must refuse to
		// run rather than silently allow a truncated scan to pass. This
		// guards against a regression where the floor is accidentally
		// removed or zeroed out.
		//
		// We mock the baseline read by intercepting the JSON.parse result
		// through a custom import. Since the baseline is imported as a JSON
		// module, we instead test the production path by mocking the
		// baseline file content through readFile.
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
								count: 397,
								// files_scanned_floor is MISSING — the ratchet
								// must refuse to run.
							}),
						);
					}
					return actual.readFile(filePath, encoding);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-missing-floor');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when the baseline has no ' +
					'`files_scanned_floor`, but got withinLimit=' +
					`${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when files_scanned_floor is zero',
	{ timeout: 30_000 },
	async () => {
		// Issue #1767 — the floor must be positive.
		//
		// A floor of 0 is logically equivalent to no floor: a truncated scan
		// covering any number of files >= 0 will pass. The ratchet must
		// refuse to run when the floor is not a positive number.
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
								count: 397,
								files_scanned_floor: 0,
							}),
						);
					}
					return actual.readFile(filePath, encoding);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-floor-zero');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when files_scanned_floor=0, ' +
					'but got withinLimit=' + `${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when files_scanned_floor is negative',
	{ timeout: 30_000 },
	async () => {
		// Issue #1767 — the floor must be positive.
		//
		// A negative floor is trivially satisfied by any real scan (which always
		// covers >= 0 files). The ratchet must refuse to run.
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
								count: 397,
								files_scanned_floor: -1,
							}),
						);
					}
					return actual.readFile(filePath, encoding);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-floor-negative');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when files_scanned_floor=-1, ' +
					'but got withinLimit=' + `${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);

test(
	'the ratchet FAILS CLOSED when files_scanned_floor is not a number',
	{ timeout: 30_000 },
	async () => {
		// Issue #1767 — the floor must be a finite number.
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
								count: 397,
								files_scanned_floor: 'ninety',
							}),
						);
					}
					return actual.readFile(filePath, encoding);
				},
			};
		});

		const { checkNoFloatingPromises: mockedCheck } =
			await import('./check-no-floating-promises.ts?mocked-floor-nan');

		try {
			const result = await mockedCheck();

			assert.strictEqual(
				result.withinLimit,
				'error',
				'expected withinLimit="error" when files_scanned_floor="ninety", ' +
					'but got withinLimit=' + `${result.withinLimit}`,
			);
		} finally {
			vi.doUnmock('node:fs/promises');
		}
	},
);
