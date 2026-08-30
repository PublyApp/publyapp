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
 *
 * ## Fixture-based replay regressions (issue #1806, ronde 11)
 *
 * The two seams the ronde-11 reviewer found are pinned here by REAL process
 * launches against a throwaway git repo + app shell created in the temp
 * directory (no mocking, no hand-crafted reports):
 *
 * 1. F1 — a declared proof whose `.expected-red.json` manifest is missing
 *    must make the runner FAIL LOUD naming the file; the silent fallback to
 *    the global classifier (which cannot see a declared-red test turn
 *    green) is gone.
 * 2. F2 — a declared kept-red test that goes green (stale=1, with
 *    unexpectedPasses=0 and corrupted=0) must make the runner exit
 *    NON-ZERO.
 *
 * A third test is the healthy control: a declared kept-red proof WITH its
 * manifest exits 0 — making the manifest mandatory must not turn a sane
 * proof into a failure.
 *
 * Each run builds its own temp repo (base commit + proof commit) so the
 * runner's local-mode diff (`HEAD~1..HEAD`) sees exactly one declared
 * proof, replays it through the REAL `pnpm exec vitest` binary (via a
 * symlink to the front package's node_modules), and classifies the REAL
 * JSON report.
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// --- Fixture-based replay regressions (issue #1806, ronde 11) ---

const RUNNER_SCRIPT = join(FRONT_ROOT, 'scripts', 'ci', 'run-preuves.mts');
const REAL_FRONT_NODE_MODULES = join(FRONT_ROOT, 'node_modules');

interface ReplayFixtureOptions {
	/** The declared kept-red test PASSES (stale scenario) or FAILS (healthy). */
	declaredTestPasses: boolean;
	/** The sibling test also PASSES, so the whole file goes green (exit 0). */
	siblingPasses: boolean;
	/** Whether the proof file gets its `.expected-red.json` companion. */
	withManifest: boolean;
}

/**
 * Build a throwaway git repo shaped like the monorepo (apps/front app shell,
 * tests/proofs with exactly ONE declared proof) and commit it in two steps
 * so the runner's local-mode diff (`HEAD~1..HEAD`) declares exactly that
 * proof. The app shell symlinks the REAL front package's node_modules so
 * `pnpm exec vitest` runs the REAL binary against a REAL minimal config.
 * Returns the root of the fixture repo (the runner's cwd is
 * <root>/apps/front).
 */
const buildReplayFixture = (options: ReplayFixtureOptions): string => {
	const root = mkdtempSync(join(tmpdir(), 'preuve-replay-'));
	const appDir = join(root, 'apps', 'front');
	const proofDir = join(appDir, 'tests', 'proofs', '99999');
	mkdirSync(proofDir, { recursive: true });

	// Minimal app shell: a package.json so pnpm resolves the project root
	// and corepack resolves the SAME pinned pnpm as the workspace (without
	// the pin, corepack falls forward to its default pnpm and trigger an
	// implicit install — network + >30s on a cold cache, observed in
	// ronde-11 development). Plus a minimal vitest.preuves.config.ts (the
	// runner passes --config explicitly) and a symlink to the real front's
	// node_modules.
	writeFileSync(
		join(appDir, 'package.json'),
		'{"name":"preuve-replay-fixture","private":true,"type":"module","packageManager":"pnpm@10.13.1"}\n',
	);
	writeFileSync(
		join(appDir, 'vitest.preuves.config.ts'),
		[
			"import { defineConfig } from 'vitest/config';",
			'',
			'export default defineConfig({',
			'\ttest: {',
			"\t\tenvironment: 'node',",
			"\t\tinclude: ['tests/proofs/**/*.{test.ts,test.tsx}'],",
			'\t\texclude: [],',
			'\t},',
			'});',
			'',
		].join('\n'),
	);
	symlinkSync(REAL_FRONT_NODE_MODULES, join(appDir, 'node_modules'), 'dir');

	// The proof: one test that behaves per the option, plus a sibling that
	// fails on an assertion (FILE stays red, vitest exit 1, classification
	// path exercised) unless the scenario demands an all-green file (exit 0).
	const declaredBody = options.declaredTestPasses
		? '\t\texpect(true).toBe(true);'
		: '\t\texpect(1).toBe(2);';
	const siblingBody = options.siblingPasses
		? '\t\t\texpect(true).toBe(true);'
		: '\t\t\texpect(1).toBe(2);';
	writeFileSync(
		join(proofDir, 'stale-proof.test.ts'),
		[
			"import { describe, expect, test } from 'vitest';",
			'',
			"describe('preuve replay fixture', () => {",
			"\t\ttest('the declared kept-red test', () => {",
			declaredBody,
			'\t\t});',
			"\t\ttest('sibling test fails on an assertion so the file stays red', () => {",
			siblingBody,
			'\t\t});',
			'});',
			'',
		].join('\n'),
	);

	if (options.withManifest) {
		writeFileSync(
			join(proofDir, 'stale-proof.test.ts.expected-red.json'),
			JSON.stringify(
				{
					expectedRed: [
						{
							testName: 'the declared kept-red test',
							why: 'fixture: a declared kept-red test must fail on correct code',
						},
					],
				},
				null,
				'\t',
			) + '\n',
		);
	}

	// Two commits: base (app shell only) then proof. The node_modules symlink
	// is deliberately NOT committed — the work tree provides it for pnpm.
	execSync('git init -q -b main', { cwd: root });
	execSync('git config user.email preuve-fixture@example.com', { cwd: root });
	execSync('git config user.name preuve-fixture', { cwd: root });
	execSync(
		'git add apps/front/package.json apps/front/vitest.preuves.config.ts',
		{ cwd: root },
	);
	execSync('git commit -qm base', { cwd: root });
	execSync('git add apps/front/tests/proofs', { cwd: root });
	execSync('git commit -qm proof', { cwd: root });
	return root;
};

/**
 * Spawn the REAL runner script against a fixture repo in LOCAL mode
 * (GITHUB_BASE_REF/GITHUB_HEAD_REF unset) and capture the outcome.
 */
const runReplayFixture = (root: string) => {
	const result = spawnSync(process.execPath, [RUNNER_SCRIPT], {
		cwd: join(root, 'apps', 'front'),
		env: freshEnv(),
		encoding: 'utf-8',
		timeout: 120000,
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

describe('proof replay — F1: the per-test manifest is mandatory, not optional', () => {
	test('a declared proof WITHOUT its expected-red manifest fails loud naming the file and the action', () => {
		// Before ronde 11 the runner silently fell back to the global
		// classifier when the manifest was absent — the exact mutation
		// the reviewer replayed (weaken the detection, `git rm` the
		// manifest): everything stayed green. The runner must now fail
		// loud naming the missing file and demanding the manifest.
		const root = buildReplayFixture({
			declaredTestPasses: true,
			siblingPasses: false,
			withManifest: false,
		});
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('expected-red manifest is MISSING');
			expect(result.stderr).toContain('stale-proof.test.ts.expected-red.json');
			// The expected action is named, not just the failure.
			expect(result.stderr).toContain('Add the manifest');
			// The silent fallback must be gone: no OK verdict, no
			// all-green summary.
			expect(result.stdout).not.toContain(
				'All declared proof tests behaved as expected.',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);
});

describe('proof replay — F2: the exit gate is pinned by a real process launch', () => {
	test('the runner exits NON-ZERO when only stale > 0 (declared kept-red test went green)', () => {
		// The declared kept-red test PASSES while a sibling still fails
		// on an assertion: classifyProofWithManifest → DECLARED RED
		// PASSED → stale=1, unexpectedPasses=0, corrupted=0. Before
		// ronde 11 no test exercised the exit gate with stale as the
		// ONLY red counter, so deleting `stale > 0` from the gate left
		// everything green. This test requires the REAL script to exit
		// non-zero.
		const root = buildReplayFixture({
			declaredTestPasses: true,
			siblingPasses: false,
			withManifest: true,
		});
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('STALE PROOF');
			expect(result.stderr).toContain('declared kept-red test');
			expect(result.stdout).toContain(
				'Stale proofs (declared red went green): 1',
			);
			// The gate must trip on stale alone — the other two red
			// counters are provably zero on this path.
			expect(result.stdout).toContain('Proof tests passed unexpectedly:  0');
			expect(result.stdout).toContain('Corrupt/unparseable proof files:  0');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);

	test('healthy control: a declared kept-red proof WITH its manifest exits 0 (no symmetric trap)', () => {
		// Making the manifest mandatory must not turn a sane proof into
		// a failure: the declared kept-red test FAILS on an assertion,
		// the manifest declares it, and the runner exits 0.
		const root = buildReplayFixture({
			declaredTestPasses: false,
			siblingPasses: false,
			withManifest: true,
		});
		try {
			const result = runReplayFixture(root);

			expect(result.status).toBe(0);
			expect(result.stdout).toContain(
				'All declared proof tests behaved as expected.',
			);
			expect(result.stdout).toContain('Proof tests failed as expected: 1');
			expect(result.stdout).toContain(
				'Stale proofs (declared red went green): 0',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);
});

describe('proof replay — an all-green proof file must fail the step (exit-0 lane)', () => {
	test('the runner exits NON-ZERO when the WHOLE proof file passes (vitest exit 0)', () => {
		// The strongest weakening of a proof: every assertion passes and
		// vitest exits 0. The runner's early exit-0 branch counts this as
		// unexpectedPasses (the manifest is never consulted — no report
		// is read). A mutation that counted the pass as an expected
		// failure (failures++) would silently green-light a fully
		// defused proof; this process test pins the branch against the
		// REAL script.
		const root = buildReplayFixture({
			declaredTestPasses: true,
			siblingPasses: true,
			withManifest: true,
		});
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('passed unexpectedly');
			expect(result.stdout).toContain('Proof tests passed unexpectedly:  1');
			expect(result.stdout).toContain(
				'Stale proofs (declared red went green): 0',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);
});

describe('proof replay — every versioned proof carries its manifest (F1 invariant)', () => {
	test('every .test.ts/.test.tsx under tests/proofs/ has a .expected-red.json companion', () => {
		const proofsDir = join(FRONT_ROOT, 'tests', 'proofs');
		const proofFiles = readdirSync(proofsDir, {
			recursive: true,
			encoding: 'utf-8',
		}).filter((rel) => rel.endsWith('.test.ts') || rel.endsWith('.test.tsx'));
		const missing = proofFiles.filter(
			(rel) => !existsSync(join(proofsDir, `${rel}.expected-red.json`)),
		);

		// A proof added without its manifest is unanalysable by the runner
		// (F1): the invariant test makes the omission fail here, in the unit
		// suite, before CI's replay ever sees it.
		expect(missing).toEqual([]);
	});
});
