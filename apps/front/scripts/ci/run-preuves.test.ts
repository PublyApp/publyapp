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
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
	//
	// The runner executes the proof through `pnpm exec vitest`, and pnpm 10
	// resolves the bin via the LOCKFILE path
	// <project>/node_modules/.pnpm/<pkg>@<hash>/node_modules/<pkg>/<bin>
	// (it does NOT walk the .bin symlink chain). A plain directory symlink
	// for node_modules therefore breaks it: the computed path lands under
	// <fixture>/node_modules/.pnpm, which does not exist (the real virtual
	// store is hoisted to the workspace root), and pnpm crashes with
	// "Cannot find module …/vitest.mjs". Observed under the full front
	// suite (ronde-11 development); reproduced in isolation as variant A
	// vs variant B below. So the fixture node_modules is a REAL directory
	// shaped like the pnpm layout: .pnpm/<vitest@hash>/node_modules/vitest
	// (dir symlink into the real store), a top-level vitest package link,
	// and the .bin/vitest entry.
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
	const fixtureNodeModules = join(appDir, 'node_modules');
	// apps/front/node_modules/vitest is itself a relative symlink into the
	// hoisted virtual store (…/node_modules/.pnpm/vitest@<hash>/node_modules/vitest).
	// path.join normalises the relative hops, giving the REAL store path.
	const storeVitestDir = join(
		REAL_FRONT_NODE_MODULES,
		readlinkSync(join(REAL_FRONT_NODE_MODULES, 'vitest')),
	);
	const storePkgDir = basename(dirname(dirname(storeVitestDir))); // vitest@<hash>
	mkdirSync(join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules'), {
		recursive: true,
	});
	symlinkSync(
		storeVitestDir,
		join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules', 'vitest'),
		'dir',
	);
	symlinkSync(storeVitestDir, join(fixtureNodeModules, 'vitest'), 'dir');
	mkdirSync(join(fixtureNodeModules, '.bin'), { recursive: true });
	symlinkSync(
		join(storeVitestDir, 'vitest.mjs'),
		join(fixtureNodeModules, '.bin', 'vitest'),
	);

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
					measuredAgainst: '0000000000000000000000000000000000000000',
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
			// The switch is gone — the per-verdict log line is no
			// longer printed. The summary carries the stale count.
			expect(result.stderr).toContain(
				'declared kept-red test(s) passed unexpectedly',
			);
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

// --- Fixture test for #1863: manifest is validated BEFORE vitest launches ---

describe('proof replay — manifest is validated BEFORE vitest launches (#1863)', () => {
	test('a declared proof WITHOUT its manifest is caught BEFORE vitest runs (message does not include vitest stderr)', () => {
		// The defect class: the runner launches vitest, which crashes with
		// "No test suite found" or a PARSE_ERROR, and THEN discovers the
		// manifest is missing. The vitest crash output (stdout/stderr)
		// appears in the error message, obscuring the real cause. The fix
		// validates the manifest before launching vitest: the error
		// message must NOT contain vitest crash output.
		const root = buildReplayFixture({
			declaredTestPasses: true,
			siblingPasses: false,
			withManifest: false,
		});
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('expected-red manifest is MISSING');
			// The error message must NOT include vitest crash output —
			// the manifest is validated before vitest is launched.
			expect(result.stderr).not.toContain('No test suite found');
			expect(result.stderr).not.toContain('PARSE_ERROR');
			expect(result.stderr).not.toContain('stdout:');
			expect(result.stderr).not.toContain('stderr:');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);

	test('a declared proof with an INVALID measuredAgainst (non-hex) is caught BEFORE vitest runs', () => {
		// The manifest declares measuredAgainst but the value is not a
		// valid hex SHA. The runner must catch this BEFORE launching
		// vitest, naming the invalid field.
		const root = buildReplayFixture({
			declaredTestPasses: true,
			siblingPasses: false,
			withManifest: true,
		});
		try {
			// Overwrite the manifest with an invalid measuredAgainst.
			const manifestPath = join(
				root,
				'apps',
				'front',
				'tests',
				'proofs',
				'99999',
				'stale-proof.test.ts.expected-red.json',
			);
			writeFileSync(
				manifestPath,
				JSON.stringify(
					{
						measuredAgainst: 'not-a-valid-sha',
						expectedRed: [
							{
								testName: 'the declared kept-red test',
								why: 'fixture: invalid measuredAgainst',
							},
						],
					},
					null,
					'\t',
				) + '\n',
			);

			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('measuredAgainst');
			expect(result.stderr).toContain('40-64 character hex');
			// Must NOT include vitest crash output.
			expect(result.stderr).not.toContain('stdout:');
			expect(result.stderr).not.toContain('stderr:');
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

// --- ERROR verdict regression (issue #1864) ---

interface ErrorFixtureOptions {
	/** Whether the proof file gets its `.expected-red.json` companion. */
	withManifest: boolean;
}

/**
 * Build a throwaway fixture whose proof file KILLS vitest with SIGKILL
 * (exit code 137). The runner must classify this as ERROR →
 * unexpectedPasses, NOT failures. This is the exact regression #1829
 * re-introduced: a switch that mapped ERROR → failures would silently
 * green-light a crashed vitest process.
 */
const buildErrorFixture = (options: ErrorFixtureOptions): string => {
	const root = mkdtempSync(join(tmpdir(), 'preuve-error-'));
	const appDir = join(root, 'apps', 'front');
	const proofDir = join(appDir, 'tests', 'proofs', '99999');
	mkdirSync(proofDir, { recursive: true });

	writeFileSync(
		join(appDir, 'package.json'),
		'{"name":"preuve-error-fixture","private":true,"type":"module","packageManager":"pnpm@10.13.1"}\n',
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
	const fixtureNodeModules = join(appDir, 'node_modules');
	const storeVitestDir = join(
		REAL_FRONT_NODE_MODULES,
		readlinkSync(join(REAL_FRONT_NODE_MODULES, 'vitest')),
	);
	const storePkgDir = basename(dirname(dirname(storeVitestDir)));
	mkdirSync(join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules'), {
		recursive: true,
	});
	symlinkSync(
		storeVitestDir,
		join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules', 'vitest'),
		'dir',
	);
	symlinkSync(storeVitestDir, join(fixtureNodeModules, 'vitest'), 'dir');
	mkdirSync(join(fixtureNodeModules, '.bin'), { recursive: true });
	symlinkSync(
		join(storeVitestDir, 'vitest.mjs'),
		join(fixtureNodeModules, '.bin', 'vitest'),
	);

	// The proof file kills vitest with SIGKILL at import time. vitest exits
	// 137 (128 + 9). The runner must classify this as ERROR →
	// unexpectedPasses, NOT failures.
	writeFileSync(
		join(proofDir, 'error-proof.test.ts'),
		[
			"import { describe, expect, test } from 'vitest';",
			'',
			'// Kill vitest with SIGKILL at import time (exit 137).',
			'process.kill(process.pid, "SIGKILL");',
			'',
			"describe('preuve ERROR fixture', () => {",
			"\ttest('never runs — vitest is dead', () => {",
			'\t\texpect(true).toBe(true);',
			'\t});',
			'});',
			'',
		].join('\n'),
	);

	if (options.withManifest) {
		writeFileSync(
			join(proofDir, 'error-proof.test.ts.expected-red.json'),
			JSON.stringify(
				{
					measuredAgainst: '0000000000000000000000000000000000000000',
					expectedRed: [
						{
							testName: 'never runs — vitest is dead',
							why: 'fixture: vitest crashes with SIGKILL before the test runs',
						},
					],
				},
				null,
				'\t',
			) + '\n',
		);
	}

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

describe('proof replay — ERROR verdict (vitest crash, issue #1864)', () => {
	test('a vitest process that crashes with SIGKILL makes the runner exit non-zero (corrupted, not failures)', () => {
		// The residual switch was dead code — it printed log lines but
		// didn't affect the counter mapping (which lives in consume-verdict).
		// Removing it eliminates the risk that a future mutation adds
		// `failures++` to the ERROR case. This process test pins the
		// runner's behavior against a REAL vitest crash: the runner must
		// exit non-zero. A SIGKILL crash prevents vitest from writing a
		// JSON report, so the runner counts it as corrupted (unreadable
		// report), NOT failures. The consume-verdict test pins the ERROR
		// → unexpectedPasses mapping for the theoretical case where vitest
		// exits non-zero/non-one with a readable report.
		const root = buildErrorFixture({ withManifest: true });
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			// A crash prevents the report from being written → corrupted.
			expect(result.stdout).toContain('Corrupt/unparseable proof files:  1');
			expect(result.stdout).toContain('Proof tests failed as expected: 0');
			expect(result.stdout).toContain('Proof tests passed unexpectedly:  0');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);
});

// --- Fixture test for #1865: three-dot diff excludes base-branch changes ---

/**
 * Build a git history where the PR branch is behind the base branch.
 *
 * The PR branch added its own proof (pr-proof.test.ts) on top of the fork
 * point. The base branch added a DIFFERENT proof (base-proof.test.ts) on
 * top of the same fork point, separately. The runner must declare ONLY the
 * PR's proof, not the base's.
 */
const buildBehindHeadFixture = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'preuve-behind-'));
	const appDir = join(root, 'apps', 'front');
	const proofDir = join(appDir, 'tests', 'proofs', '99999');
	mkdirSync(proofDir, { recursive: true });

	writeFileSync(
		join(appDir, 'package.json'),
		'{"name":"preuve-behind-fixture","private":true,"type":"module","packageManager":"pnpm@10.13.1"}\n',
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
	const fixtureNodeModules = join(appDir, 'node_modules');
	const REAL_FRONT_NODE_MODULES = process.env.REAL_FRONT_NODE_MODULES;
	if (REAL_FRONT_NODE_MODULES) {
		const storeVitestDir = join(
			REAL_FRONT_NODE_MODULES,
			readlinkSync(join(REAL_FRONT_NODE_MODULES, 'vitest')),
		);
		const storePkgDir = basename(dirname(dirname(storeVitestDir)));
		mkdirSync(join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules'), {
			recursive: true,
		});
		symlinkSync(
			storeVitestDir,
			join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules', 'vitest'),
			'dir',
		);
		symlinkSync(storeVitestDir, join(fixtureNodeModules, 'vitest'), 'dir');
		mkdirSync(join(fixtureNodeModules, '.bin'), { recursive: true });
		symlinkSync(
			join(storeVitestDir, 'vitest.mjs'),
			join(fixtureNodeModules, '.bin', 'vitest'),
		);
	}

	writeFileSync(
		join(proofDir, 'pr-proof.test.ts'),
		[
			"import { describe, expect, test } from 'vitest';",
			'',
			"describe('PR proof', () => {",
			"\ttest('the PR proof fails on an assertion', () => {",
			'\t\texpect(1).toBe(2);',
			'\t});',
			'});',
			'',
		].join('\n'),
	);
	writeFileSync(
		join(proofDir, 'pr-proof.test.ts.expected-red.json'),
		JSON.stringify(
			{
				measuredAgainst: '0000000000000000000000000000000000000000',
				expectedRed: [
					{
						testName: 'the PR proof fails on an assertion',
						why: 'fixture: PR proof must fail on correct code',
					},
				],
			},
			null,
			'\t',
		) + '\n',
	);

	// Git history:
	// 1. base commit (app shell) — this is the fork point
	// 2. pr-proof commit (PR branch adds its proof on top of fork point)
	// 3. base-proof commit (base branch adds its proof on top of fork point, separately)
	// The PR branch's HEAD is at step 2; the base ref is at step 3.
	// merge-base(base, HEAD) = step 1. Three-dot diff = step 2 only.
	execSync('git init -q -b lane/pr-branch', { cwd: root });
	execSync('git config user.email preuve-fixture@example.com', { cwd: root });
	execSync('git config user.name preuve-fixture', { cwd: root });
	execSync(
		'git add apps/front/package.json apps/front/vitest.preuves.config.ts',
		{ cwd: root },
	);
	execSync('git commit -qm base', { cwd: root }); // fork point
	execSync('git add apps/front/tests/proofs', { cwd: root });
	execSync('git commit -qm pr-proof', { cwd: root }); // PR branch HEAD

	// Switch to the fork point and create the base branch there.
	execSync('git checkout -b develop HEAD~1', { cwd: root }); // base at fork point
	// Add a proof that only the base branch has (not the PR branch).
	const baseProofDir = join(appDir, 'tests', 'proofs', '88888');
	mkdirSync(baseProofDir, { recursive: true });
	writeFileSync(
		join(baseProofDir, 'base-proof.test.ts'),
		[
			"import { describe, expect, test } from 'vitest';",
			'',
			"describe('base proof', () => {",
			"\ttest('base proof fails on an assertion', () => {",
			'\t\texpect(1).toBe(2);',
			'\t});',
			'});',
			'',
		].join('\n'),
	);
	writeFileSync(
		join(baseProofDir, 'base-proof.test.ts.expected-red.json'),
		JSON.stringify(
			{
				measuredAgainst: '0000000000000000000000000000000000000000',
				expectedRed: [
					{
						testName: 'base proof fails on an assertion',
						why: 'fixture: base proof must fail on correct code',
					},
				],
			},
			null,
			'\t',
		) + '\n',
	);
	execSync('git add apps/front/tests/proofs', { cwd: root });
	execSync('git commit -qm base-proof', { cwd: root }); // base branch advances

	// Switch back to the PR branch so HEAD points to the PR's own proof.
	execSync('git checkout lane/pr-branch', { cwd: root });

	// The runner fetches from "origin" remote — set it to the local repo.
	// The runner looks for refs/remotes/origin/develop, so we need to
	// create that ref as a remote-tracking branch.
	execSync('git remote add origin .', { cwd: root });
	execSync('git fetch origin develop:refs/remotes/origin/develop', {
		cwd: root,
	});

	return root;
};

describe('proof replay — three-dot diff excludes base-branch changes (#1865)', () => {
	test("a PR branch behind the base branch declares ONLY its own proofs, not the base branch's", () => {
		// The defect class: a two-dot diff (`origin/develop..HEAD`) would
		// include base-branch changes made since the fork, spuriously
		// declaring the base branch's proof as if the PR author had added
		// it. The three-dot diff (`mergeBase...HEAD`) shows ONLY changes
		// the PR branch introduced.
		const root = buildBehindHeadFixture();
		try {
			const result = spawnSync(process.execPath, [RUNNER_SCRIPT], {
				cwd: join(root, 'apps', 'front'),
				env: {
					...freshEnv(),
					GITHUB_BASE_REF: 'develop',
					GITHUB_HEAD_REF: 'lane/pr-branch',
				},
				encoding: 'utf-8',
				timeout: 120000,
			});

			if (result.error) {
				throw result.error;
			}

			// The runner must NOT declare the base branch's proof.
			expect(result.stdout).not.toContain('base-proof.test.ts');
			// The runner MUST declare the PR branch's proof.
			expect(result.stdout).toContain('pr-proof.test.ts');
			// Only ONE proof is declared (the PR's own).
			expect(result.stdout).toContain('This PR declared 1 paired red proof(s)');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);
});
// --- Fixture test for #1940: deleted proofs under tests/proofs/ ---

/**
 * Build a throwaway git repo where the PR commit DELETES proof files under
 * `apps/front/tests/proofs/`. The deletion mode is the parameter so the
 * test suite can exercise (a) an entire subtree deleted, (b) a single
 * file deleted, and (c) a renamed proof. The repo shape matches
 * `buildReplayFixture` so the runner's local-mode diff (HEAD~1..HEAD)
 * sees exactly the deletion we want it to refuse.
 */
const buildDeletionFixture = (mode: 'subtree' | 'file' | 'rename'): string => {
	const root = mkdtempSync(join(tmpdir(), 'preuve-deletion-'));
	const appDir = join(root, 'apps', 'front');
	const proofDir = join(appDir, 'tests', 'proofs', '1940');
	mkdirSync(proofDir, { recursive: true });

	writeFileSync(
		join(appDir, 'package.json'),
		'{"name":"preuve-deletion-fixture","private":true,"type":"module","packageManager":"pnpm@10.13.1"}\n',
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
	// node_modules shape — mirrors buildReplayFixture so pnpm 10 can
	// resolve the vitest binary the same way.
	const fixtureNodeModules = join(appDir, 'node_modules');
	const storeVitestDir = join(
		REAL_FRONT_NODE_MODULES,
		readlinkSync(join(REAL_FRONT_NODE_MODULES, 'vitest')),
	);
	const storePkgDir = basename(dirname(dirname(storeVitestDir)));
	mkdirSync(join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules'), {
		recursive: true,
	});
	symlinkSync(
		storeVitestDir,
		join(fixtureNodeModules, '.pnpm', storePkgDir, 'node_modules', 'vitest'),
		'dir',
	);
	symlinkSync(storeVitestDir, join(fixtureNodeModules, 'vitest'), 'dir');
	mkdirSync(join(fixtureNodeModules, '.bin'), { recursive: true });
	symlinkSync(
		join(storeVitestDir, 'vitest.mjs'),
		join(fixtureNodeModules, '.bin', 'vitest'),
	);

	// Commit 1: app shell + a "doomed" proof file under tests/proofs/1940/.
	const writeProof = (rel: string) => {
		writeFileSync(
			join(proofDir, rel),
			[
				"import { describe, expect, test } from 'vitest';",
				'',
				"describe('1940 deletion fixture', () => {",
				"\ttest('fails on an assertion (would be replayed as a kept-red proof)', () => {",
				'\t\texpect(1).toBe(2);',
				'\t});',
				'});',
				'',
			].join('\n'),
		);
	};
	writeProof('doomed.test.ts');
	writeProof('also-doomed.test.ts');
	execSync('git init -q -b main', { cwd: root });
	execSync('git config user.email preuve-fixture@example.com', { cwd: root });
	execSync('git config user.name preuve-fixture', { cwd: root });
	execSync(
		'git add apps/front/package.json apps/front/vitest.preuves.config.ts apps/front/tests/proofs',
		{ cwd: root },
	);
	execSync('git commit -qm base-with-proofs', { cwd: root });

	if (mode === 'subtree') {
		// `git rm -r` an entire tests/proofs/1940 subtree. HEAD~1..HEAD
		// shows two D entries — the runner must refuse the entire
		// directory loud, naming the subtree.
		execSync('git rm -rq apps/front/tests/proofs/1940', { cwd: root });
	} else if (mode === 'file') {
		// `git rm` exactly one file under the subtree — the runner must
		// refuse the individual file loud, naming the path.
		execSync('git rm -q apps/front/tests/proofs/1940/doomed.test.ts', {
			cwd: root,
		});
	} else {
		// `git mv` a proof into a sibling subtree. With -z renames are
		// reported as R<score> OLD NEW, and the runner must reject the
		// rename loud because the manifest cannot follow.
		execSync('mkdir -p apps/front/tests/proofs/1940-renamed', { cwd: root });
		execSync(
			'git mv apps/front/tests/proofs/1940/doomed.test.ts apps/front/tests/proofs/1940-renamed/moved.test.ts',
			{ cwd: root },
		);
	}
	execSync('git commit -qm deletion', { cwd: root });
	return root;
};

describe('proof replay — deletions under tests/proofs/ are refused loud (#1940)', () => {
	test('a wholly-deleted tests/proofs/<X>/ subtree is refused loud, naming the directory and offering PROUVE_ALLOW_DELETED', () => {
		// The defect: `git diff --name-only` (the pre-#1940 shape) listed
		// zero entries for a deletion-only diff. `declaredProofTests()`
		// then returned [], the runner hit the "no proofs declared"
		// branch and exited 0 — a silent green light that verified
		// nothing. The fix inspects the status column; the runner must
		// now exit non-zero AND name the deleted subtree AND offer the
		// explicit PROUVE_ALLOW_DELETED opt-in.
		const root = buildDeletionFixture('subtree');
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			// The error must name the directory (not just one of its files).
			expect(result.stderr).toContain('tests/proofs/1940/');
			// The opt-in must be offered — that is the explicit-conscious-
			// decision shape the fix mandates.
			expect(result.stderr).toContain('PROUVE_ALLOW_DELETED=1940');
			// The silent false-green must be gone: no "no proofs
			// declared" message and no all-green summary.
			expect(result.stdout).not.toContain(
				'This PR did not declare any paired red proofs',
			);
			expect(result.stdout).not.toContain(
				'All declared proof tests behaved as expected.',
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);

	test('a single deleted .test.ts under tests/proofs/ is refused loud, naming the file', () => {
		// A single-file deletion shares the same defect class as the
		// subtree case but with a different surface: `existsSync` would
		// have crashed on ENOENT (a hard red) or, worse, the runner
		// would have reported "corrupted" — a misleading classification
		// that masks the real cause (deletion, not corruption). The fix
		// must surface the file path and the opt-in to acknowledge the
		// deletion, not the corruption story.
		const root = buildDeletionFixture('file');
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('doomed.test.ts');
			expect(result.stderr).toContain('PROUVE_ALLOW_DELETED=1940');
			// The "CORRUPT PROOF" misnomer must be gone.
			expect(result.stdout).not.toContain('CORRUPT PROOF');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);

	test('a renamed proof file is refused loud, naming both old and new paths', () => {
		// Renames are reported as R<score> OLD NEW in the -z format.
		// The runner cannot verify the new path without an explicit
		// manifest rename, so the rename must be refused loud with both
		// paths named. A silent rename (e.g. a runner that followed the
		// new path and replayed a manifest-less file) would have
		// surfaced as "missing manifest" — a misleading cause. The fix
		// surfaces the rename directly.
		const root = buildDeletionFixture('rename');
		try {
			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('doomed.test.ts');
			expect(result.stderr).toContain('moved.test.ts');
			// The status character is named so the operator can grep.
			expect(result.stderr).toContain('"R"');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);
});
// ---------------------------------------------------------------------------
// #1768: three-point diff + clear ENOENT messaging.
//
// When the three-dot diff declares a proof that does NOT exist in the working
// tree (deleted after the diff, or the diff declared a file that was never
// checked out), the runner must FAIL LOUD — naming the missing file and its
// resolved path — rather than crashing with an opaque ENOENT or silently
// skipping it (which would make the gate a no-op: "no proofs to replay").
// ---------------------------------------------------------------------------

describe('proof replay — declared proof file is missing from the working tree (#1768)', () => {
	test('a declared proof that does not exist on disk (ENOENT) is caught loud by validateProofFile before replay', () => {
		// Build the standard healthy fixture, then DELETE the declared proof
		// file from the working tree. The runner's `validateProofFile` must
		// catch the missing file and fail the step naming the file path,
		// never crashing with a raw ENOENT stack or silently skipping.
		const root = buildReplayFixture({
			declaredTestPasses: false,
			siblingPasses: false,
			withManifest: true,
		});
		try {
			// Delete the proof file (the .expected-red.json sidecar stays,
			// so the missing-file path is exercised, not the missing-manifest path).
			const proofFile = join(
				root,
				'apps',
				'front',
				'tests',
				'proofs',
				'99999',
				'stale-proof.test.ts',
			);
			// The proof must exist before we delete it, otherwise the deletion
			// proves nothing and the fixture would be green for the wrong reason.
			expect(existsSync(proofFile)).toBe(true);
			rmSync(proofFile);
			expect(existsSync(proofFile)).toBe(false);

			const result = runReplayFixture(root);

			// Must fail (not a false green).
			expect(result.status).not.toBe(0);
			// The error must NAME the missing file — not a raw ENOENT stack.
			expect(result.stderr).toContain('stale-proof.test.ts');
			expect(result.stderr).toContain('ENOENT');
			expect(result.stderr).toContain('file is missing');
			// #1768: a merely-behind branch must NOT be accused of corruption.
			// The message names the remedy (merge develop) and the label is
			// MISSING PROOF, never CORRUPT PROOF.
			expect(result.stderr).toContain('merge develop');
			expect(result.stderr).toContain('MISSING PROOF');
			expect(result.stderr).not.toContain('CORRUPT PROOF');
			expect(result.stdout).toContain('Declared proofs missing from tree: 1');
			// Must not show a vitest crash traceback obscuring the cause.
			expect(result.stderr).not.toContain('No test suite found');
			expect(result.stderr).not.toContain('stdout:');
		} catch (err) {
			rmSync(root, { recursive: true, force: true });
			throw err;
		}
		rmSync(root, { recursive: true, force: true });
	}, 120000);

	test('a declared proof file that is empty (0 bytes) is caught loud before replay', () => {
		// An empty file is not a real test — vitest would crash with a
		// parse/ENOENT error. validateProofFile must catch it first, naming
		// the file as empty.
		const root = buildReplayFixture({
			declaredTestPasses: false,
			siblingPasses: false,
			withManifest: true,
		});
		try {
			const proofFile = join(
				root,
				'apps',
				'front',
				'tests',
				'proofs',
				'99999',
				'stale-proof.test.ts',
			);
			// Truncate to 0 bytes.
			writeFileSync(proofFile, '');

			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('stale-proof.test.ts');
			expect(result.stderr).toContain('0 bytes');
			// Paired correction (#1960): a file that EXISTS but is corrupt is
			// still ACCUSED of corruption — it must never be redirected to
			// "merge develop" (that remedy is for MISSING files only).
			expect(result.stderr).toContain('CORRUPT PROOF');
			expect(result.stderr).not.toContain('merge develop');
			expect(result.stdout).toMatch(/Corrupt\/unparseable proof files:\s+1/);
		} catch (err) {
			rmSync(root, { recursive: true, force: true });
			throw err;
		}
		rmSync(root, { recursive: true, force: true });
	}, 120000);

	test('a declared proof file that is binary (null bytes) is STILL accused of corruption, never told to merge develop', () => {
		// The paired guard for #1768: the fix must not trade a false corruption
		// accusation for an unjustified silence. A proof file that EXISTS but
		// contains binary junk cannot measure anything — validateProofFile
		// must name it CORRUPT PROOF, and the message must NOT suggest merging
		// develop (the file is present; merging cannot repair it).
		const root = buildReplayFixture({
			declaredTestPasses: false,
			siblingPasses: false,
			withManifest: true,
		});
		try {
			const proofFile = join(
				root,
				'apps',
				'front',
				'tests',
				'proofs',
				'99999',
				'stale-proof.test.ts',
			);
			// Replace the proof with binary garbage: a null byte in the middle
			// of an otherwise-UTF-8 file.
			writeFileSync(proofFile, 'import x from\u0000"binary";\n');

			const result = runReplayFixture(root);

			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain('stale-proof.test.ts');
			expect(result.stderr).toContain('null bytes');
			expect(result.stderr).toContain('CORRUPT PROOF');
			expect(result.stderr).not.toContain('merge develop');
			expect(result.stdout).toMatch(/Corrupt\/unparseable proof files:\s+1/);
		} catch (err) {
			rmSync(root, { recursive: true, force: true });
			throw err;
		}
		rmSync(root, { recursive: true, force: true });
	}, 120000);
});

describe('proof replay — CI mode declared proof file missing from disk is named with the resolved path (#1768)', () => {
	test('in CI mode (GITHUB_BASE_REF/HEAD_REF set), a declared-but-missing proof names the absolute path', () => {
		// In CI mode the runner resolves the proof path relative to its cwd
		// (apps/front). When the file is missing, the error message must
		// name the resolved path so the operator can see exactly which file
		// the three-dot diff declared but could not find — never a bare
		// ENOENT without the path.
		const root = buildBehindHeadFixture();
		try {
			// Delete the PR branch's proof from the working tree.
			const proofFile = join(
				root,
				'apps',
				'front',
				'tests',
				'proofs',
				'99999',
				'pr-proof.test.ts',
			);
			expect(existsSync(proofFile)).toBe(true);
			rmSync(proofFile);

			const result = spawnSync(process.execPath, [RUNNER_SCRIPT], {
				cwd: join(root, 'apps', 'front'),
				env: {
					...freshEnv(),
					GITHUB_BASE_REF: 'develop',
					GITHUB_HEAD_REF: 'lane/pr-branch',
				},
				encoding: 'utf-8',
				timeout: 120000,
			});

			if (result.error) {
				throw result.error;
			}

			expect(result.status).not.toBe(0);
			// Names the missing file.
			expect(result.stderr).toContain('pr-proof.test.ts');
			// Names the cause (ENOENT / missing file), not just a crash.
			expect(result.stderr).toContain('ENOENT');
			expect(result.stderr).toContain('file is missing');
			// #1768: the CI-mode remedy is the same — merge develop.
			expect(result.stderr).toContain('merge develop');
			expect(result.stderr).toContain('MISSING PROOF');
			expect(result.stderr).not.toContain('CORRUPT PROOF');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 120000);
});
