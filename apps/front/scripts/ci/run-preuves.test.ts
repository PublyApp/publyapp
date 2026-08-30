/**
 * @vitest-environment node
 *
 * Unit tests for the CI-environment handling in run-preuves.mts.
 *
 * ## The regression this file guards (#1806, ronde 10)
 *
 * `declaredProofTests()` needs BOTH GITHUB_BASE_REF and GITHUB_HEAD_REF to
 * compute the PR diff scope. Before ronde 10, when exactly ONE of the two
 * was defined, the code silently fell through to the LOCAL branch
 * (`git diff HEAD~1..HEAD`), concluded "This PR did not declare any paired
 * red proofs" and exited 0 — a false green: CI believed the declaration
 * check had run while the script actually diffed a scope the PR author
 * never intended.
 *
 * The fix: a half-set environment FAILS HARD naming the missing variable,
 * and a genuinely local run (neither variable defined) is announced loudly
 * and kept distinct from the CI "no proofs declared" message.
 *
 * ## Why spawn the real script instead of importing it
 *
 * run-preuves.mts is a top-level script: importing it executes the main
 * logic, which calls process.exit() — it cannot be imported as a module.
 * These tests spawn the REAL script through the REAL entrypoint with a
 * controlled environment, which is exactly how CI and `just test-preuves`
 * run it.
 *
 * ## Red-capability (the required proof)
 *
 * The first test is the paired proof from the brief: restore the silent
 * fallback (delete the half-set guard so a single-set environment drops
 * into the local diff) and this test goes RED — the child exits 0 with the
 * CI no-op message instead of failing loud.
 */
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// apps/front — the cwd the script expects (it resolves ROOT and PROOFS_DIR
// relative to process.cwd()).
const FRONT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

interface LocalRunCapture {
	stdout: string;
	stderr: string;
}

const freshEnv = () => {
	const env: NodeJS.ProcessEnv = { ...process.env };
	delete env.GITHUB_BASE_REF;
	delete env.GITHUB_HEAD_REF;
	return env;
};

// Arrow function per the lane's coding rule (arrow everywhere except class
// methods, #1806 ronde 10).
const runScript = (setBaseRef: boolean, setHeadRef: boolean) => {
	const env = freshEnv();
	if (setBaseRef) {
		env.GITHUB_BASE_REF = 'develop';
	}
	if (setHeadRef) {
		env.GITHUB_HEAD_REF = 'lane/wt-1783';
	}

	const result = spawnSync(process.execPath, ['scripts/ci/run-preuves.mts'], {
		cwd: FRONT_ROOT,
		env,
		encoding: 'utf-8',
		timeout: 30000,
	});

	if (result.error) {
		throw result.error;
	}

	return {
		status: result.status,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
};

/**
 * Run the script in local mode and capture its output WITHOUT waiting for the
 * process to finish. The local branch can REPLAY declared proofs when
 * HEAD~1..HEAD spans a develop merge (whose parent delta touches
 * tests/proofs/) — that replay can take minutes and must not gate this test.
 * We stop as soon as both signals are visible: the stderr announcement
 * (printed before the diff, unconditionally) and one of the two local stdout
 * branches (no-proofs message or the replay banner).
 */
const captureLocalRun = (): Promise<LocalRunCapture> =>
	new Promise<LocalRunCapture>((resolve, reject) => {
		const child = spawn(process.execPath, ['scripts/ci/run-preuves.mts'], {
			cwd: FRONT_ROOT,
			env: freshEnv(),
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: true,
		});

		let stdout = '';
		let stderr = '';
		let settled = false;

		const finish = (capture: LocalRunCapture) => {
			if (settled) {
				return;
			}
			settled = true;
			// Stop the child and its descendants (the vitest replay, if any)
			// now that the local-mode signals are captured.
			try {
				process.kill(-child.pid!, 'SIGKILL');
			} catch {
				// Already gone.
			}
			resolve(capture);
		};

		const timer = setTimeout(() => {
			finish({ stdout, stderr });
		}, 20000);

		const maybeFinish = () => {
			const decisionSeen =
				stderr.includes('LOCAL RUN') &&
				(stdout.includes('LOCAL RUN —') || stdout.includes('This PR declared'));
			if (decisionSeen) {
				clearTimeout(timer);
				finish({ stdout, stderr });
			}
		};

		child.stdout?.on('data', (chunk: Buffer) => {
			stdout += chunk.toString('utf-8');
			maybeFinish();
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			stderr += chunk.toString('utf-8');
			maybeFinish();
		});
		child.on('error', (err) => {
			clearTimeout(timer);
			if (!settled) {
				settled = true;
				reject(err);
			}
		});
		child.on('exit', () => {
			clearTimeout(timer);
			if (!settled) {
				settled = true;
				resolve({ stdout, stderr });
			}
		});
	});

describe('declaredProofTests — CI environment handling', () => {
	test('a half-set CI environment (only GITHUB_BASE_REF) fails loud naming the missing variable', () => {
		// Reproduces the exact false-green the brief verified at tip: only
		// GITHUB_BASE_REF set, the old code exited 0 with the "no proofs
		// declared" message. The fix must make the script throw BEFORE any
		// git command runs.
		const result = runScript(true, false);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('GITHUB_HEAD_REF');
		expect(result.stderr).toContain('incomplete CI environment');
		// The silent false-green output must be gone.
		expect(result.stdout).not.toContain(
			'This PR did not declare any paired red proofs',
		);
	});

	test('a half-set CI environment (only GITHUB_HEAD_REF) fails loud naming the missing variable', () => {
		const result = runScript(false, true);

		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('GITHUB_BASE_REF');
		expect(result.stderr).toContain('incomplete CI environment');
	});

	test('a fully local run (neither variable) announces itself and is distinct from the CI no-op', async () => {
		const { stdout, stderr } = await captureLocalRun();

		// The stderr announcement is unconditional in local mode: it is
		// printed BEFORE the diff, regardless of what HEAD~1..HEAD contains.
		expect(stderr).toContain('LOCAL RUN');

		// stdout must take one of the two local branches and NEVER the CI
		// no-op sentence:
		// - no proofs in HEAD~1..HEAD → 'LOCAL RUN — no proof test files...'
		// - proofs in HEAD~1..HEAD (e.g. the head commit is a develop merge
		//   whose parent delta spans tests/proofs/) → 'This PR declared ...'
		const noProofMessage = stdout.includes('LOCAL RUN —');
		const replayBanner = stdout.includes('This PR declared');
		expect(noProofMessage || replayBanner).toBe(true);
		expect(stdout).not.toContain(
			'This PR did not declare any paired red proofs',
		);
	});
});
