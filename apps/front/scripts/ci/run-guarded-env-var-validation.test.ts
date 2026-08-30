/**
 * @vitest-environment node
 *
 * Paired red/green proof for PR #1944 correction — `GUARD_TIMEOUT_SECONDS`
 * env var validation in `run-guarded.mts`.
 *
 * ## Problem measured
 *
 * A bare `Number('abc')` returns NaN. `setTimeout` receives 1 ms (Node.js
 * clamps NaN/0/negative to 1 ms). The guard is killed instantly. The error
 * message reads "did not finish within NaNs" — blaming the guard for
 * something the variable caused.
 *
 * Four invalid values tested:
 *   GUARD_TIMEOUT_SECONDS=abc   -> NaN
 *   GUARD_TIMEOUT_SECONDS=''   -> 0
 *   GUARD_TIMEOUT_SECONDS=0     -> 0
 *   GUARD_TIMEOUT_SECONDS=-5    -> -5
 *
 * Plus one nominal case:
 *   GUARD_TIMEOUT_SECONDS=30    -> 30
 *
 * ## RED without the fix
 *
 * `run-guarded.mts` exits 1 with "did not finish within NaNs/0s/-5s"
 * for invalid inputs. The test asserts exit 2 and a message that names the
 * variable — so it fails.
 *
 * ## GREEN with the fix
 *
 * Invalid inputs exit 2 immediately with "GUARD_TIMEOUT_SECONDS is invalid:
 * got ...". The nominal case passes the guard through unchanged.
 *
 * ## Regression guard
 *
 * The test also scans the source for bare `Number(` calls on
 * `process.env` to catch any future reintroduction of the bug.
 */
import { execFile, type ExecFileException } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const FRONT_ROOT = path.resolve(import.meta.dirname, '..', '..'); // scripts/ci → apps/front
const WRAPPER = path.join(FRONT_ROOT, 'scripts', 'run-guarded.mts');

// The proof itself must not hang. A valid guard at 30s timeout takes ~3 s.
const PROOF_TIMEOUT_MS = 15_000;

const runWrapper = (
	guardPath: string,
	timeoutSeconds: string,
): Promise<{ code: number; stderr: string }> =>
	new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`proof safety-net exceeded ${PROOF_TIMEOUT_MS}ms`));
		}, PROOF_TIMEOUT_MS);

		execFile(
			process.execPath,
			[WRAPPER, guardPath],
			{
				env: {
					...process.env,
					GUARD_TIMEOUT_SECONDS: timeoutSeconds,
				},
				cwd: FRONT_ROOT,
				encoding: 'utf-8',
			},
			(err: ExecFileException | null, _stdout: string, stderr: string) => {
				clearTimeout(timeout);
				if (err) {
					const code =
						typeof err.code === 'string' && /^\d+$/.test(err.code)
							? Number.parseInt(err.code, 10)
							: typeof err.code === 'number'
								? err.code
								: -1;
					resolve({ code, stderr });
				} else {
					resolve({ code: 0, stderr });
				}
			},
		);
	});

const makeInstantGuard = async (): Promise<string> => {
	// Written to a temp dir but kept for reference; mkdtemp cleans it up.
	const { mkdtemp, writeFile } = await import('node:fs/promises');
	const { tmpdir } = await import('node:os');
	const dir = await mkdtemp(path.join(tmpdir(), 'proof-1944-env-'));
	const guardPath = path.join(dir, 'instant-guard.mts');
	await writeFile(
		guardPath,
		"process.stdout.write('instant-guard-ok\\n'); process.exit(0);",
		'utf-8',
	);
	return guardPath;
};

describe('run-guarded.mts — GUARD_TIMEOUT_SECONDS env var validation', () => {
	// Regression guard: bare Number(process.env without an isFinite guard was
	// the root cause. If anyone reintroduces it, the test fails.
	// We search for Number(process.env and verify that the immediately
	// following line (the guard condition) contains isFinite.
	it('guards the Number(process.env) result with isFinite before use', () => {
		const source = readFileSync(WRAPPER, 'utf-8');
		const lines = source.split('\n');
		const numberEnvIndex = lines.findIndex((l) =>
			l.includes('Number(process.env'),
		);
		if (numberEnvIndex === -1) {
			// No Number(process.env) found — the env var would be unused.
			expect(numberEnvIndex).not.toBe(-1);
			return;
		}
		// Check the current line AND the next 2 lines for isFinite.
		// The validation pattern spans up to 2 lines:
		//   const parsedTimeoutSeconds = Number(process.env.GUARD_TIMEOUT_SECONDS ?? '300');
		//   if (!Number.isFinite(parsedTimeoutSeconds) || parsedTimeoutSeconds <= 0) {
		const window = lines.slice(numberEnvIndex, numberEnvIndex + 3).join('\n');
		expect(window).toContain('isFinite');
	});

	// ---- Invalid inputs: must exit 2, message names the variable ----

	it(
		'exits 2 with a variable-naming message for GUARD_TIMEOUT_SECONDS=abc',
		async () => {
			const guardPath = await makeInstantGuard();
			const result = await runWrapper(guardPath, 'abc');

			expect(result.code).toBe(2);
			expect(result.stderr).toContain('GUARD_TIMEOUT_SECONDS');
			expect(result.stderr).toContain('abc');
			expect(result.stderr).toContain('finite number > 0');
			// Must NOT say "did not finish within NaNs"
			expect(result.stderr).not.toContain('did not finish within');
		},
		PROOF_TIMEOUT_MS,
	);

	it(
		'exits 2 with a variable-naming message for GUARD_TIMEOUT_SECONDS=""',
		async () => {
			const guardPath = await makeInstantGuard();
			const result = await runWrapper(guardPath, '');

			expect(result.code).toBe(2);
			expect(result.stderr).toContain('GUARD_TIMEOUT_SECONDS');
			expect(result.stderr).toContain('""');
			expect(result.stderr).toContain('finite number > 0');
			expect(result.stderr).not.toContain('did not finish within');
		},
		PROOF_TIMEOUT_MS,
	);

	it(
		'exits 2 with a variable-naming message for GUARD_TIMEOUT_SECONDS=0',
		async () => {
			const guardPath = await makeInstantGuard();
			const result = await runWrapper(guardPath, '0');

			expect(result.code).toBe(2);
			expect(result.stderr).toContain('GUARD_TIMEOUT_SECONDS');
			expect(result.stderr).toContain('"0"');
			expect(result.stderr).toContain('finite number > 0');
			expect(result.stderr).not.toContain('did not finish within');
		},
		PROOF_TIMEOUT_MS,
	);

	it(
		'exits 2 with a variable-naming message for GUARD_TIMEOUT_SECONDS=-5',
		async () => {
			const guardPath = await makeInstantGuard();
			const result = await runWrapper(guardPath, '-5');

			expect(result.code).toBe(2);
			expect(result.stderr).toContain('GUARD_TIMEOUT_SECONDS');
			expect(result.stderr).toContain('"-5"');
			expect(result.stderr).toContain('finite number > 0');
			expect(result.stderr).not.toContain('did not finish within');
		},
		PROOF_TIMEOUT_MS,
	);

	// ---- Nominal input: guard passes through unchanged ----

	it(
		'passes a guard through unchanged with a valid GUARD_TIMEOUT_SECONDS=30',
		async () => {
			const guardPath = await makeInstantGuard();
			const result = await runWrapper(guardPath, '30');

			expect(result.code).toBe(0);
			// No error message should appear for a valid value
			expect(result.stderr).not.toContain('GUARD_TIMEOUT_SECONDS');
			expect(result.stderr).not.toContain('is invalid');
		},
		PROOF_TIMEOUT_MS,
	);
});
