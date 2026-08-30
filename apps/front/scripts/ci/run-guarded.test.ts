/**
 * @vitest-environment node
 *
 * Paired red/green proof for issue #1525 — the front guard-test runner
 * (`apps/front/scripts/run-guarded.mts`) must kill the entire process tree
 * of a frozen guard, not merely the runner PID.
 *
 * ## Why this test
 *
 * Without the timeout wrapper, a frozen guard holds the CI lock indefinite-ly
 * — #1525 observed 30+ downstream `pnpm --filter front test` waiters stuck
 * behind a single hung guard. The wrapper spawns the guard in a new process
 * group and SIGKILLs that group (negative PGID) on timeout, so even deeply
 * nested children are reaped. This proof exercises that contract directly.
 *
 * ## RED without the fix
 *
 * Without `run-guarded.mts`, spawning a deliberately frozen guard and waiting
 * for the configured 3-second timeout would hang the test past vitest's own
 * `testTimeout` (30s) — the proof would fail (timeout exit, no assertions
 * reached). The safety-net `GUARD_TIMEOUT_SECONDS` ceiling prevents the proof
 * itself from hanging indefinitely.
 *
 * ## GREEN with the fix
 *
 * With the wrapper in place, the frozen guard is killed after exactly 3
 * seconds, the wrapper exits non-zero, prints the guard name + duration, and
 * leaves zero orphaned child processes.
 */
import { execFile, spawn, type ExecFileException } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

const FRONT_ROOT = path.resolve(import.meta.dirname, '..', '..'); // scripts/ci → apps/front
const WRAPPER = path.join(FRONT_ROOT, 'scripts', 'run-guarded.mts');

// The proof itself must never hang more than ~15s even if the wrapper is
// missing or misbehaving (3s guard timeout × safety multiplier of 5,
// leaving generous headroom for child-process spawn + /proc scan overhead).
const PROOF_TIMEOUT_MS = 15000;

/**
 * Spawn the wrapper with the given guard path and timeout override.
 * Returns the real exit code on normal completion, or the wrapper's
 * timeout failure exit code.
 */
const runWrapper = (
	guardPath: string,
	timeoutSeconds: string,
	env: Record<string, string | undefined> = process.env,
): Promise<{ code: number; stdout: string; stderr: string }> =>
	new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			// Safety net: if even the wrapper's own mechanism has failed,
			// reject so vitest's testTimeout catches it rather than hanging.
			reject(
				new Error(
					`run-guarded proof safety-net exceeded ${PROOF_TIMEOUT_MS}ms`,
				),
			);
		}, PROOF_TIMEOUT_MS);

		execFile(
			process.execPath,
			[WRAPPER, guardPath],
			{
				env: {
					...env,
					GUARD_TIMEOUT_SECONDS: timeoutSeconds,
					// Make sure PATH resolution matches local dev.
					PATH: process.env.PATH,
				},
				cwd: FRONT_ROOT,
				encoding: 'utf-8',
			},
			(err: ExecFileException | null, stdout: string, stderr: string) => {
				clearTimeout(timeout);
				if (err) {
					// execFile surfaces non-zero exits as errors with .code set
					// to the process exit code string.
					const code =
						typeof err.code === 'string' && /^\d+$/.test(err.code)
							? Number.parseInt(err.code, 10)
							: -1;
					resolve({ code, stdout, stderr });
				} else {
					resolve({ code: 0, stdout, stderr });
				}
			},
		);
	});

const makeFrozenGuard = async (): Promise<string> => {
	const dir = await mkdtemp(path.join(tmpdir(), 'proof-1525-'));
	const childScriptPath = path.join(dir, 'frozen-child.mts');
	await writeFile(
		childScriptPath,
		[
			"process.stdout.write('frozen-child-started\\n');",
			'// This child runs forever — the exact #1525 orphan scenario.',
			'setInterval(() => {}, 1000);',
		].join('\n'),
		'utf-8',
	);
	const guardPath = path.join(dir, 'frozen-guard.mts');
	await writeFile(
		guardPath,
		[
			'// Deliberately frozen guard that spawns a child process.',
			'// Without run-guarded.mts this hangs forever AND leaves the child',
			'// orphaned when killed by PID (the exact #1525 bug class).',
			"import { spawn } from 'node:child_process';",
			"import process from 'node:process';",
			"process.stdout.write('frozen-guard-started\\n');",
			"const child = spawn(process.execPath, [process.argv[1].replace('frozen-guard.mts', 'frozen-child.mts')], { stdio: 'inherit' });",
			'// setInterval keeps the parent alive forever.',
			'setInterval(() => {}, 1000);',
		].join('\n'),
		'utf-8',
	);
	return guardPath;
};

const makeNormalGuard = async (): Promise<{ path: string; dir: string }> => {
	const dir = await mkdtemp(path.join(tmpdir(), 'proof-1525-'));
	const guardPath = path.join(dir, 'normal-guard.mts');
	await writeFile(
		guardPath,
		["process.stdout.write('normal-guard-ok\\n');", 'process.exit(0);'].join(
			'\n',
		),
		'utf-8',
	);
	return { path: guardPath, dir };
};

describe('run-guarded.mts — issue #1525 timeout kills process tree', () => {
	it(
		'kills a frozen guard within the timeout and names it in stderr',
		async () => {
			const frozenGuardPath = await makeFrozenGuard();
			const dir = path.dirname(frozenGuardPath);

			const result = await runWrapper(frozenGuardPath, '3');

			// The wrapper must exit non-zero (timeout failure, not 0).
			expect(result.code).not.toBe(0);

			// stderr must name the specific frozen guard script path.
			expect(result.stderr).toContain(frozenGuardPath);

			// stderr must report the 3-second timeout, not the default 300s.
			// The wrapper prints: GUARD TIMEOUT: "..." did not finish within 3s
			expect(result.stderr).toMatch(/3s\b/);
			expect(result.stderr).not.toMatch(/300s\b/);

			// stderr must show the command line that timed out.
			expect(result.stderr).toContain('command:');

			// stdout must show the guard actually started (proof that the
			// wrapper spawned the *real* guard, not a no-op).
			expect(result.stdout).toContain('frozen-guard-started');

			// stdout must also show the spawned child started — proving the
			// frozen guard spawns a child process that the wrapper MUST
			// kill via process-group SIGKILL (not just the parent PID).
			expect(result.stdout).toContain('frozen-child-started');

			await rm(dir, { recursive: true, force: true });
		},
		PROOF_TIMEOUT_MS + 5000,
	);

	it(
		'leaves no orphaned child processes after killing the tree',
		async () => {
			const frozenGuardDir = await makeFrozenGuard();
			const frozenGuardPath = frozenGuardDir;

			await runWrapper(frozenGuardPath, '3');

			// Give the kernel a moment to reap the killed process group.
			// Then scan /proc for any process whose command line contains
			// 'frozen-guard' OR 'frozen-child' — both should be gone.
			// If only the parent PID were killed (not the process group),
			// the child would survive as an orphan holding the CI lock.
			await new Promise((r) => setTimeout(r, 200));

			let survivors = 0;
			try {
				const entries = readdirSync('/proc');
				for (const entry of entries) {
					if (!/^\d+$/.test(entry)) {
						continue;
					}
					const cmdlinePath = `/proc/${entry}/cmdline`;
					try {
						const cmdline = readFileSync(cmdlinePath, 'utf-8').replace(
							/\0/g,
							' ',
						);
						if (
							cmdline.includes('frozen-guard') ||
							cmdline.includes('frozen-child')
						) {
							survivors++;
						}
					} catch {
						// Process may have exited — skip.
					}
				}
			} catch {
				// /proc not available (non-Linux) — skip the orphan check.
			}

			expect(survivors).toBe(0);

			await rm(path.dirname(frozenGuardPath), { recursive: true, force: true });
		},
		PROOF_TIMEOUT_MS + 5000,
	);

	it(
		'passes a normal (non-frozen) guard through unchanged',
		async () => {
			const { path: normalGuardPath, dir } = await makeNormalGuard();

			const result = await runWrapper(normalGuardPath, '3');

			// Normal guard must exit 0.
			expect(result.code).toBe(0);

			// stdout must be intact (the guard's own output).
			expect(result.stdout).toContain('normal-guard-ok');

			await rm(dir, { recursive: true, force: true });
		},
		PROOF_TIMEOUT_MS,
	);

	it(
		'propagates SIGINT to the child process group on Ctrl-C',
		async () => {
			const dir = await mkdtemp(path.join(tmpdir(), 'proof-1525-sigint-'));
			const guardPath = path.join(dir, 'running-guard.mts');
			await writeFile(
				guardPath,
				[
					"process.stdout.write('running-guard-started\\n');",
					'// A guard that runs forever — simulates a test in progress.',
					'setInterval(() => {}, 1000);',
				].join('\n'),
				'utf-8',
			);

			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('SIGINT proof safety-net exceeded'));
				}, PROOF_TIMEOUT_MS);

				const wrapper = spawn(process.execPath, [WRAPPER, guardPath], {
					env: { ...process.env, GUARD_TIMEOUT_SECONDS: '30' },
					cwd: FRONT_ROOT,
					stdio: ['inherit', 'inherit', 'inherit'],
				});

				// Let the guard start, then send SIGINT to the wrapper
				// (simulating Ctrl-C in a terminal).
				setTimeout(() => {
					wrapper.kill('SIGINT');
				}, 500);

				wrapper.on('exit', (code) => {
					clearTimeout(timeout);
					// 130 = 128 + 2 (SIGINT)
					expect(code).toBe(130);
					resolve();
				});

				wrapper.on('error', () => {
					clearTimeout(timeout);
					reject(new Error('Failed to spawn wrapper'));
				});
			});

			// Verify no orphaned child process remains.
			let survivors = 0;
			try {
				const entries = readdirSync('/proc');
				for (const entry of entries) {
					if (!/^\d+$/.test(entry)) {
						continue;
					}
					try {
						const cmdline = readFileSync(
							`/proc/${entry}/cmdline`,
							'utf-8',
						).replace(/\0/g, ' ');
						if (cmdline.includes('running-guard')) {
							survivors++;
						}
					} catch {
						// Process may have exited — skip.
					}
				}
			} catch {
				// /proc not available — skip.
			}
			expect(survivors).toBe(0);

			await rm(dir, { recursive: true, force: true });
		},
		PROOF_TIMEOUT_MS + 5000,
	);
});
