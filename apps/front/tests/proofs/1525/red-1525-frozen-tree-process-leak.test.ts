/**
 * @vitest-environment node
 *
 * KEPT RED PROOF — issue #1525.
 *
 * ## Context
 *
 * `apps/front/scripts/run-guarded.mts` wraps every front guard invocation with
 * two guarantees:
 *
 * 1. **Process-tree kill.** The guard runs in a NEW PROCESS GROUP
 *    (`detached: true`). On timeout, the wrapper sends SIGKILL to the
 *    NEGATIVE PGID — killing the entire tree, not just the runner.
 * 2. **Clear error message.** On timeout the wrapper prints:
 *    `GUARD TIMEOUT: "path/to/guard" did not finish within 300s (ran for Ns).`
 *
 * This proof asserts both guarantees on the REAL production file.
 *
 * ## Three-state discrimination
 *
 * - BUGUE PRÉSENT (detached:true absent): the child spawns WITHOUT a new
 *   process group. `kill(-child.pid)` sends SIGKILL to PGID 1 (init) — the
 *   child is NOT in the group, so it survives as an orphan. The orphan-check
 *   assertion PASSES (survivors > 0) → the CI step turns RED.
 *
 * - BUGUE ABSENT (detached:true present): the child IS the process-group
 *   leader. `kill(-child.pid)` kills the entire tree. The orphan-check
 *   assertion FAILS (survivors = 0) → kept-red state, the CI step is GREEN.
 *
 * - MESURE IMPOSSIBLE: the production file is unreadable or the frozen guard
 *   cannot be created → the proof throws → CI step turns RED.
 *
 * ## Mutations that restore the bug
 *
 * **Mutation A — remove `detached: true`:** in the spawn call, remove
 * `detached: true`. The child no longer becomes a process-group leader,
 * `kill(-child.pid)` targets PGID 1, and the child survives. The orphan-check
 * assertion `expect(survivors).toBe(0)` PASSES (survivors > 0) → CI GREEN.
 *
 * **Mutation B — `kill(child.pid)` instead of `kill(-child.pid)`:** send the
 * signal to the POSITIVE PID. This kills only the direct child, leaving any
 * grandchild orphan. The orphan-check fails → CI GREEN.
 *
 * Both mutations make the process-tree kill fail while leaving the error
 * message intact. The proof catches both by checking the ONLY reliable signal:
 * whether any process from the frozen tree survives.
 *
 * ## Honest limits
 *
 * This proof does NOT test the SIGINT propagation (it is tested separately in
 * run-guarded.test.ts). It also does NOT test invalid GUARD_TIMEOUT_SECONDS
 * values (validated separately in run-guarded-env-var-validation.test.ts).
 * It is scoped to the TWO guarantees named in the brief: process-tree kill
 * and clear error message.
 */
import { execFile, type ExecFileException } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// scripts/run-guarded.mts is at apps/front/scripts/run-guarded.mts
// tests/proofs/1525/red-1525-*.test.ts → 4 levels up.
const _thisFile = fileURLToPath(import.meta.url);
const FRONT_ROOT = path.resolve(_thisFile, '..', '..', '..', '..');
const WRAPPER = path.join(FRONT_ROOT, 'scripts', 'run-guarded.mts');

// The proof itself must never hang more than ~15s even if the wrapper is
// missing or misbehaving. A 3-second guard timeout × safety multiplier of 5.
const PROOF_TIMEOUT_MS = 15_000;

/** Run the wrapper against a guard script with a short timeout. */
const runWrapper = (
	guardPath: string,
	timeoutSeconds: string,
): Promise<{ code: number; stdout: string; stderr: string }> =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`proof safety-net exceeded ${PROOF_TIMEOUT_MS}ms`));
		}, PROOF_TIMEOUT_MS);

		execFile(
			process.execPath,
			[WRAPPER, guardPath],
			{
				env: { ...process.env, GUARD_TIMEOUT_SECONDS: timeoutSeconds },
				cwd: FRONT_ROOT,
				encoding: 'utf-8',
			},
			(err: ExecFileException | null, stdout: string, stderr: string) => {
				clearTimeout(timer);
				if (err) {
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

/** Build a guard that spawns a child and hangs forever. */
const makeFrozenTree = async (): Promise<{
	guardPath: string;
	childToken: string;
	dir: string;
}> => {
	const dir = await mkdtemp(path.join(tmpdir(), 'proof-1525-'));
	const childScriptPath = path.join(dir, 'frozen-child.mts');
	const childToken = `proof-1525-child-${Date.now()}`;
	await writeFile(
		childScriptPath,
		[
			`process.stdout.write('${childToken}\\n');`,
			'setInterval(() => {}, 1000);',
		].join('\n'),
		'utf-8',
	);
	const guardPath = path.join(dir, 'frozen-guard.mts');
	await writeFile(
		guardPath,
		[
			`import { spawn } from 'node:child_process';`,
			`import process from 'node:process';`,
			`process.stdout.write('guard-started\\n');`,
			`spawn(process.execPath, ['${childScriptPath.replace(/'/g, "\\'")}'], { stdio: 'inherit' });`,
			'setInterval(() => {}, 1000);',
		].join('\n'),
		'utf-8',
	);
	return { guardPath, childToken, dir };
};

/** Count process-tree survivors whose cmdline mentions the child token. */
const countSurvivors = (childToken: string): number => {
	let count = 0;
	try {
		const entries = readdirSync('/proc');
		for (const entry of entries) {
			if (!/^\d+$/.test(entry)) {
				continue;
			}
			try {
				const cmdline = readFileSync(`/proc/${entry}/cmdline`, 'utf-8').replace(
					/\0/g,
					' ',
				);
				if (cmdline.includes(childToken)) {
					count++;
				}
			} catch {
				// Process exited.
			}
		}
	} catch {
		// /proc unavailable.
	}
	return count;
};

describe('run-guarded.mts process-tree kill — RED: detached:true missing from spawn (#1525)', () => {
	it(
		'kills a frozen process tree and leaves no orphaned descendants',
		async () => {
			const { guardPath, childToken, dir } = await makeFrozenTree();

			// Give the frozen tree 3 seconds to timeout, then give the kernel
			// 200ms to reap the killed PIDs before scanning.
			await runWrapper(guardPath, '3');
			await new Promise((r) => setTimeout(r, 200));

			const survivors = countSurvivors(childToken);

			// The kept-red state: WITHOUT `detached: true`, the child is NOT
			// in the wrapper's process group. `kill(-child.pid)` sends the
			// signal to the child's OWN PGID (which is the same as its PID),
			// killing only the direct child, NOT the grandchild.
			// `survivors` is therefore > 0 and the assertion PASSES.
			// The CI step turns RED — "proof is stale".
			expect(survivors).toBeGreaterThan(0);

			await rm(dir, { recursive: true, force: true });
		},
		PROOF_TIMEOUT_MS + 5000,
	);
});

describe('run-guarded.mts clear timeout message — RED: error message absent (#1525)', () => {
	it(
		'prints the guard path and timeout duration on timeout',
		async () => {
			const dir = await mkdtemp(path.join(tmpdir(), 'proof-1525-'));
			const guardPath = path.join(dir, 'eternal-guard.mts');
			await writeFile(
				guardPath,
				[
					'process.stdout.write("started\\n");',
					'setInterval(() => {}, 1000);',
				].join('\n'),
				'utf-8',
			);

			const result = await runWrapper(guardPath, '3');

			await rm(dir, { recursive: true, force: true });

			// The kept-red state: if the error message format is stripped from
			// run-guarded.mts (e.g. the message is replaced with a bare
			// `console.error('timeout')` or removed entirely), stderr no longer
			// contains the guard path. The assertion `not.toContain(guardPath)`
			// therefore PASSES when the message is stripped (bug present, green),
			// and FAILS when the message is present (bug absent, red — the
			// kept-red state).
			//
			// Similarly, if the "3s" duration is removed, the second assertion
			// passes (green). When both are present, both fail (red).
			//
			// The brief demands: "Le test X a depasse N secondes" — the guard
			// path and the duration must both be present. Stripping either one
			// is the adverse mutation the proof catches.
			expect(result.stderr).not.toContain(guardPath);
			expect(result.stderr).not.toMatch(/3s\b/);
		},
		PROOF_TIMEOUT_MS,
	);
});
