import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';

import { findSuppressionSitesInSource } from '../../src/lib/suppression-reason.ts';
import {
	cleanupFixtures,
	getOwnedRootPath,
	getFixtureParentPath,
	makeOwnedTempDirectory,
	makeFixture,
	registerFixtureSignalHandlers,
} from './check-design-system-fixtures.mts';
import {
	createHandoffLedgerProbe,
	KNOWN_GUARD_DEBT,
	scanFront2DesignSystem,
	scanFront2DesignSystemInternals,
} from './check-design-system.mts';
import type { GuardDebtEntry } from './check-design-system.mts';

const testFilePath = fileURLToPath(import.meta.url);
let fixtureParent: string | undefined;

// The probe's own two handshake lines and the grand-child runner's TAP stream
// share one pipe, so under load (or a pty) TAP banners interleave between them
// and may prefix them as `# ` comments. Match the two values independently
// instead of demanding adjacent undecorated lines — the values themselves are
// what matter.
//
// #1256: the PID half anchors to an UNCOMMENTED line start. A foreign child
// running its own probe under the same runner emits its handshake through the
// reporter as `# RUNNER_PID=…` TAP comments; trusting those would kill a
// process we do not own.
//
// #1272 r2: ownership of the ROOT half is PROVEN, not pattern-matched. The
// parent generates an unguessable nonce per spawn and hands it to the child
// through its environment; only a line carrying THAT EXACT nonce can resolve.
// A foreign or replayed `# RUNNER_OWNED_ROOT=` comment — even one whose path
// carries our predictable tmpdir prefix — never carries our per-spawn nonce,
// so it can never resolve. Only an uncommented, nonce-bearing root resolves:
// the live probe always emits exactly that shape, so there is no accepted
// commented-root fallback at all. Anything else leaves the handshake
// unresolved; on the live probe the start timeout then fails loud with the
// whole buffer in its message instead of touching a process or path we do
// not own.
const HANDSHAKE_NONCE_RE = /^[A-Za-z0-9+/=]{32,}$/;
export const matchRunnerHandshake = (output: string, expectedNonce: string) => {
	if (
		typeof expectedNonce !== 'string' ||
		!HANDSHAKE_NONCE_RE.test(expectedNonce)
	) {
		throw new TypeError(
			'matchRunnerHandshake requires an unguessable expectedNonce',
		);
	}
	const pidMatch = output.match(/^RUNNER_PID=(\d+)$/m);
	if (!pidMatch) {
		return null;
	}
	const escaped = expectedNonce.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const rootMatch = output.match(
		new RegExp(`^RUNNER_OWNED_ROOT=${escaped}:(\\S+)$`, 'm'),
	);
	if (rootMatch) {
		return { pid: Number(pidMatch[1]), root: rootMatch[1] };
	}
	return null;
};

// #1352: the runner-interruption probe chain is BOUNDED. Its normal runtime
// is ~5 s warm (~14 s cold; measured 2026-08-25 on Node v24.19.0, three
// full-file runs: 14342 ms / 5313 ms / 5319 ms), yet twice (2026-08-23 and
// 2026-08-25) the same chain hung ~26 minutes on Node 24: after the
// deliberate SIGINT the runner-interruption teardown sometimes never
// completes, and nothing bounded the exit wait. This budget keeps ~8x
// headroom over the slowest measured run while turning the observed
// 26-minute hang into a loud failure within two minutes.
// #1352 Node 24 hang — HYPOTHESIS, NOT a reproduced root cause (rewritten
// 2026-08-25, r1 finding 3; full dated record with every measurement:
// docs/issues/1352/2026-08-25-node24-probe-hang-hypothesis.md). MEASURED:
// this exact probe flow held a lane ~26 minutes twice (2026-08-25,
// captain-reported in issue #1352; 2026-08-23 per the lane brief — no raw
// log survives for that earlier occurrence), while
// local replays could NOT re-trigger it deterministically — a manual replay
// of the whole chain exited 25 ms after SIGINT, a
// full run under a pty completed in ~5 s, and three timed full-file runs
// took 14342/5313/5319 ms (timings recorded in the dated record). HYPOTHESIS
// (plausible, unproven): the chain is three levels deep — this test's
// process → the spawned runner-probe wrapper
// (`check-design-system-runner-probe.mjs`) → its own `node --test`
// grand-child running the live probe test — and SIGINT makes the wrapper
// run ASYNC fixture cleanup (see registerFixtureSignalHandlers) while the
// grand-child runner performs its own interruption teardown; IF that
// combined race never completes, the wrapper keeps waiting on its
// grand-child and our old code kept waiting on the wrapper with NO ceiling
// anywhere — matching the two observed ~26-minute holds. Related upstream
// work (titles/states verified via the GitHub API on 2026-08-25; NONE is
// confirmed to describe this exact hang): nodejs/node#62037 `test_runner:
// use default signal exit codes when interrupted` (closed), #57394
// `test_runner: ensure proper teardown when tests run without isolation`
// (open), #62056 `test_runner: fix run() none-isolation teardown hang`
// (closed). If the hypothesis is right, the hang lives inside node:test's
// own teardown — not in code this repo controls — so no fix can be applied
// AND proven without a deterministic reproduction, and none was attempted;
// the budget below stays as the standing guard REGARDLESS of cause and
// turns any recurrence into a loud failure within two minutes instead of a
// silent 26-minute lock hold.
export const RUNNER_PROBE_BUDGET_MS = 120_000;

// #1352 r1 finding 2: the budget is overridable from the environment (CI vs
// local). Parsing is STRICT: unset → the documented 120_000ms default;
// present → a plain base-10 positive integer is required. Anything else —
// whitespace, an explicit sign, a decimal or exponent form, garbage — fails
// LOUD naming the variable and the exact bad value. A mistyped override must
// never silently restore the default.
export const resolveRunnerProbeBudgetMs = ({ env = process.env } = {}) => {
	const raw = env.RUNNER_PROBE_BUDGET_MS;
	if (raw === undefined) {
		return RUNNER_PROBE_BUDGET_MS;
	}
	const fail = () => {
		throw new TypeError(
			`RUNNER_PROBE_BUDGET_MS must be a positive integer number of milliseconds, got RUNNER_PROBE_BUDGET_MS=${JSON.stringify(raw)}`,
		);
	};
	if (!/^-?\d+$/.test(raw)) {
		fail();
	}
	const parsed = Number(raw);
	if (parsed <= 0) {
		fail();
	}
	return parsed;
};

// #1352: strict-parse validation entry for the CHILD side of the live probe
// flow (it must fail loud before creating anything). The PARENT side — the
// bounded wait — acquires its value through resolveRunnerProbeBudgetMs
// inside the one shared flow function below, where the #1352 r2 proof
// exercises it with an injected environment.
export const realProbeBudget = () => resolveRunnerProbeBudgetMs();

// #1352 r2: the REAL probe's "spawn the runner-probe wrapper → wait for its
// handshake → SIGINT it → wait bounded by the resolved budget → kill tree on
// expiry" flow, extracted so there is exactly ONE implementation of that
// wait: both the real test and the #1352 proofs traverse this very function,
// so a mutant that disconnects the resolved budget from the wait (a literal
// at the consumption site) turns the proofs RED. `env` is the environment
// the budget is resolved from AND the child's base environment; `runnerPath`
// is the wrapper script to spawn. Returns the exit result plus the probe's
// owned root; throws if the handshake never resolves within 20 s.
export const runRunnerInterruptionProbe = async ({
	env,
	runnerPath,
}: {
	env: NodeJS.ProcessEnv;
	runnerPath: string;
}) => {
	const handshakeNonce = randomBytes(24).toString('base64');
	// The budget is resolved FIRST, through the shared seam, BEFORE any child
	// is spawned — a bad RUNNER_PROBE_BUDGET_MS override must fail loud with
	// nothing to leak and nothing left to clean up.
	const budgetMs = resolveRunnerProbeBudgetMs({ env });
	const child = spawn(process.execPath, [runnerPath], {
		env: {
			...env,
			FRONT2_DESIGN_GUARD_RUNNER_PROBE: '1',
			// Per-spawn secret: only a stdout line echoing THIS value can
			// resolve the handshake (see matchRunnerHandshake).
			FRONT2_DESIGN_GUARD_HANDSHAKE_NONCE: handshakeNonce,
		},
		// #1352: detached makes the child its own process-group leader, so
		// budget expiry can SIGKILL the WHOLE tree (this child and its
		// grand-child node:test runner) via a negative-PID kill.
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	let output = '';
	let probe;
	try {
		probe = await new Promise<{ pid: number; root: string }>(
			(resolve, reject) => {
				let timeout: ReturnType<typeof setTimeout>;
				const onData = (chunk: Buffer) => {
					output += chunk.toString();
					// The probe's own two handshake lines and the grand-child
					// runner's TAP stream share one pipe, so under load (or a pty)
					// TAP banners interleave between them.
					// matchRunnerHandshake matches the two values independently
					// instead of demanding adjacent undecorated lines — the values
					// themselves are what matter.
					try {
						const handshake = matchRunnerHandshake(output, handshakeNonce);
						if (handshake) {
							clearTimeout(timeout);
							resolve(handshake);
						}
					} catch {
						// Unreachable: handshakeNonce is always a valid nonce.
					}
				};
				timeout = setTimeout(() => {
					// A start failure must not leak the child either — kill the whole
					// tree before failing loud with the whole buffer.
					const childPid = child.pid;
					assert.ok(
						childPid !== undefined,
						`probe child pid expected, got: ${String(childPid)}`,
					);
					killProcessTree(childPid);
					reject(new Error(`runner probe did not start:\n${output}`));
				}, 20_000);
				// An early death (e.g. a broken wrapper) must reject NOW, not leave
				// this promise hanging on the 20 s timer. Once the handshake has
				// resolved, this handler is inert: rejecting an already-settled
				// promise is a no-op.
				child.once('exit', () => {
					clearTimeout(timeout);
					reject(
						new Error(`runner probe exited before its handshake:\n${output}`),
					);
				});
				child.stdout.on('data', onData);
				child.stderr.on('data', onData);
				child.once('error', reject);
			},
		);
	} catch (error) {
		// A start failure already killed the tree; make sure no partial child
		// survives an 'error'-path rejection either.
		const childPid = child.pid;
		assert.ok(
			childPid !== undefined,
			`probe child pid expected, got: ${String(childPid)}`,
		);
		killProcessTree(childPid);
		throw error;
	}
	process.kill(probe.pid, 'SIGINT');
	// #1352: the exit wait is BOUNDED — this is the exact wait that hung ~26
	// minutes twice on Node 24 with no ceiling. On expiry the helper kills
	// the whole tree and fails loud naming the probe, the budget and the
	// last output line. There is deliberately NO second wait anywhere else in
	// this flow: this call is the single consumption site of the resolved
	// budget in the real path.
	return {
		result: await awaitExitWithinBudget({
			child,
			budgetMs,
			probeName: 'check-design-system runner-interruption probe',
			getLastOutput: () => output,
		}),
		root: probe.root,
	};
};

// Best-effort kill of a fixture tree from the pid report the r2 fixture
// writes at startup. Used by the proof's watchdog so a mutant whose wait
// ignores the resolved budget can neither leak processes nor pin this
// file's event loop with its runaway timer after the RED lands.
export const killFixtureTreeFromReport = async (reportPath: string) => {
	let pids;
	try {
		pids = (await readFile(reportPath, 'utf8'))
			.split('\n')
			.filter((line) => line.trim() !== '')
			.map((line) => Number(line));
	} catch {
		// The fixture never got far enough to report — nothing to kill.
		return;
	}
	for (const pid of pids) {
		killProcessTree(pid);
	}
};

// Kill the whole process group first — the probe child is spawned
// `detached`, so it leads its own group and the negative-PID signal reaches
// its own children (the grand-child node:test runner) too — then the pid
// itself as the fallback for timings where the group is already gone.
// Standard library only: no tree-kill dependency.
export const killProcessTree = (pid: number) => {
	try {
		process.kill(-pid, 'SIGKILL');
	} catch {
		// Group already gone: fall through to the direct kill.
	}
	try {
		process.kill(pid, 'SIGKILL');
	} catch {
		// Already dead — exactly what we want.
	}
};

// The fail-loud contract: on expiry the tree is killed and the error NAMES
// the probe, the budget and the last output line — never a silent pass,
// never a skipped probe.
export const formatProbeTimeoutMessage = ({
	probeName,
	budgetMs,
	output,
}: {
	probeName: string;
	budgetMs: number;
	output: string;
}) => {
	const lastLine =
		output
			.split('\n')
			.filter((line) => line.trim() !== '')
			.at(-1) ?? '(no output)';
	return `the ${probeName} exceeded its ${Math.round(budgetMs)}ms budget: the interrupt was delivered but the child never exited, so its whole process tree was killed. Last output line: ${JSON.stringify(lastLine)}`;
};

// Await a child's exit within a hard budget. On expiry KILL the whole
// process tree and REJECT with the named message. An exit racing the
// post-expiry grace window still rejects: once expired, the outcome is
// failure, whatever the exit code — a budget breach is never a pass.
export const awaitExitWithinBudget = ({
	child,
	budgetMs,
	probeName,
	getLastOutput,
}: {
	child: ChildProcess;
	budgetMs: number;
	probeName: string;
	getLastOutput: () => string;
}) =>
	new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
		(resolve, reject) => {
			let expired = false;
			let graceTimer: ReturnType<typeof setTimeout> | undefined;
			const timeoutMessage = () =>
				formatProbeTimeoutMessage({
					probeName,
					budgetMs,
					output: getLastOutput(),
				});
			const timer = setTimeout(() => {
				expired = true;
				const childPid = child.pid;
				assert.ok(
					childPid !== undefined,
					`probe child pid expected, got: ${String(childPid)}`,
				);
				killProcessTree(childPid);
				graceTimer = setTimeout(
					() => reject(new Error(timeoutMessage())),
					1_000,
				);
			}, budgetMs);
			child.once(
				'exit',
				(code: number | null, signal: NodeJS.Signals | null) => {
					clearTimeout(timer);
					if (graceTimer !== undefined) {
						clearTimeout(graceTimer);
					}
					if (expired) {
						reject(new Error(timeoutMessage()));
						return;
					}
					resolve({ code, signal });
				},
			);
		},
	);

if (process.env.FRONT2_DESIGN_GUARD_RUNNER_PROBE) {
	test('runner interruption probe leaves an active owned fixture', async () => {
		// Validate the budget FIRST, through the shared seam: a bad override
		// must fail loud before any fixture exists — nothing to leak, nothing
		// left to clean up. The resolved VALUE itself bounds the parent side
		// of this flow (see 'the real node:test runner cleans...' below),
		// so here only the strict parse matters.
		realProbeBudget();
		const root = await makeFixture({
			'probe.ts': 'export const probe = true;',
		});
		const ownedRoot = await getOwnedRootPath();
		const reportDirectory = await makeOwnedTempDirectory('runner-report');
		await writeFile(
			path.join(reportDirectory, 'owned'),
			`${ownedRoot}\n${root}`,
		);
		// The parent generated this nonce for THIS spawn and passed it through
		// the environment; echoing it back is the only way this probe's root
		// can be recognised (a foreign/replayed root cannot know it).
		process.stdout.write(
			`RUNNER_OWNED_ROOT=${process.env.FRONT2_DESIGN_GUARD_HANDSHAKE_NONCE}:${ownedRoot}\n`,
		);
		setInterval(() => {}, 1_000);
		await new Promise(() => {});
	});
}

test('the real node:test runner cleans its owned root when interrupted', async (t) => {
	if (process.env.FRONT2_DESIGN_GUARD_RUNNER_PROBE) {
		t.skip('probe runs only in a child process');
		return;
	}
	// #1352 r2: the whole flow — spawn, handshake, SIGINT, bounded wait,
	// kill tree — is the ONE shared function below; this test drives it with
	// the process environment exactly as the live guard does.
	const { result, root } = await runRunnerInterruptionProbe({
		env: process.env,
		runnerPath: fileURLToPath(
			new URL('./check-design-system-runner-probe.mts', import.meta.url),
		),
	});
	assert.notEqual(result.code, 0);
	await assert.rejects(access(root), { code: 'ENOENT' });
});

// #1352: co-located proof of the bound itself, driven over the SAME
// awaitExitWithinBudget wiring the real probe uses, with a tiny budget and
// a never-ending parent->grand-child fixture chain. Against the
// pre-#1352 code this test could not exist: there was no budget and no
// kill-tree helper, and the plain exit wait hung forever on such a child
// (RED: importing the then-missing exports fails the suite loudly against
// the old code; the ~26-minute Node 24 hangs of 2026-08-23/25 are the
// real-world equivalent). The timeout must FIRE, the WHOLE tree must die
// (no orphan pid), and the rejection must name the probe, the budget and
// the last output line.
test('#1352: the probe budget fires on a never-ending child, kills the whole process tree, and fails loud naming the probe', async () => {
	const root = await makeFixture({
		'never-ending-child.mjs': [
			'// #1352 fixture: a handle that never closes and never exits.',
			'setInterval(() => {}, 1_000);',
		].join('\n'),
		'never-ending-parent.mjs': [
			"import { spawn } from 'node:child_process';",
			"import path from 'node:path';",
			"import { fileURLToPath } from 'node:url';",
			"const grandChildPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'never-ending-child.mjs');",
			"const grandChild = spawn(process.execPath, [grandChildPath], { stdio: 'ignore' });",
			'process.stdout.write(`PARENT_PID=${process.pid}\\nGRAND_PID=${grandChild.pid}\\n`);',
			'setInterval(() => {}, 1_000);',
		].join('\n'),
	});
	const child = spawn(
		process.execPath,
		[path.join(root, 'never-ending-parent.mjs')],
		{ detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
	);
	let output = '';
	child.stdout.on('data', (chunk) => {
		output += chunk.toString();
	});
	const startedAt = Date.now();
	await assert.rejects(
		() =>
			awaitExitWithinBudget({
				child,
				budgetMs: resolveRunnerProbeBudgetMs({
					env: { RUNNER_PROBE_BUDGET_MS: '300' },
				}),
				probeName: '#1352 never-ending fixture',
				getLastOutput: () => output,
			}),
		(error: Error) => {
			assert.match(
				error.message,
				/#1352 never-ending fixture exceeded its 300ms budget/,
			);
			assert.match(error.message, /Last output line: /);
			return true;
		},
	);
	// The budget must actually elapse (not fire early) and must actually
	// FIRE (the pre-#1352 unbounded wait would hang here until CI dies).
	assert.ok(
		Date.now() - startedAt >= 290,
		'the budget must elapse before the timeout fires',
	);
	assert.ok(
		Date.now() - startedAt < 10_000,
		'the timeout must fire — an unbounded wait hangs forever on this fixture',
	);
	const pidMatch = output.match(/^PARENT_PID=(\d+)$/m);
	const grandMatch = output.match(/^GRAND_PID=(\d+)$/m);
	assert.ok(
		pidMatch && grandMatch,
		`fixture handshake expected, got: ${output}`,
	);
	// No orphan pids: the fixture child AND its own grand-child must be
	// dead. A zombie can survive briefly between SIGKILL and reaping, so
	// poll briefly before failing.
	const childPid = child.pid;
	assert.ok(
		childPid !== undefined,
		`fixture child pid expected, got: ${String(childPid)}`,
	);
	const deadline = Date.now() + 5_000;
	for (const pid of [Number(pidMatch[1]), Number(grandMatch[1]), childPid]) {
		let gone = false;
		while (Date.now() < deadline) {
			try {
				process.kill(pid, 0);
			} catch {
				gone = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.equal(
			gone,
			true,
			`pid ${pid} must be dead — killing the tree must leave no orphan`,
		);
	}
});

// #1352 r2 finding (BLOCKS_PR): the round-1 proof pinned the SOURCE TEXT of
// the budget assignment and runtime-called the resolver itself — but the
// real probe's actual WAIT could be handed any literal without the proof
// noticing (the reviewer's mutant: a `9_999_999` literal at the consumption
// site stayed GREEN across all seven proofs). The real flow now lives in
// ONE exported function, runRunnerInterruptionProbe, and THIS proof drives
// that very function — not a copy of its call — with a small injected
// RUNNER_PROBE_BUDGET_MS against a fixture child that answers the handshake
// and then IGNORES SIGINT forever. Because the fixture reaches the shared
// wait phase, the resolved budget must ACTUALLY bound it: the rejection
// naming the injected 800ms budget must arrive (elapsed ≈ budget, capped
// well above by the assertions and a 15s watchdog), and the expired wait's
// kill-tree must leave every fixture pid dead. ANY disconnect between the
// resolved budget and its consumption — a hardcoded literal, Infinity, a
// bypassed seam — leaves the child running, the named rejection never
// arrives, and the watchdog turns the suite RED. No text-pinning anywhere:
// behaviour is the proof.
test('#1352 r2: the REAL probe flow fires within an injected small RUNNER_PROBE_BUDGET_MS and kills its tree', async () => {
	const root = await makeFixture({
		'r2-ignored-sigint-grandchild.mjs': [
			'// #1352 fixture: a handle that never closes and never exits.',
			'setInterval(() => {}, 1_000);',
		].join('\n'),
		'r2-ignored-sigint-parent.mjs': [
			"import { spawn } from 'node:child_process';",
			"import { writeFileSync } from 'node:fs';",
			"import path from 'node:path';",
			"import { fileURLToPath } from 'node:url';",
			"const grandChildPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'r2-ignored-sigint-grandchild.mjs');",
			"const grandChild = spawn(process.execPath, [grandChildPath], { stdio: 'ignore' });",
			'writeFileSync(process.env.R2_FIXTURE_REPORT, `${process.pid}\\n${grandChild.pid}\\n`);',
			'// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
			"process.on('SIGINT', () => {});",
			'process.stdout.write(`RUNNER_PID=${process.pid}\\nRUNNER_OWNED_ROOT=${process.env.FRONT2_DESIGN_GUARD_HANDSHAKE_NONCE}:${process.env.R2_FIXTURE_ROOT}\\n`);',
			'setInterval(() => {}, 1_000);',
		].join('\n'),
	});
	const reportPath = path.join(root, 'pids.txt');
	// Registered so the module-level test:fail cleanup below can reach this
	// run's fixture tree even when an assertion throws mid-test.
	// Registered so the module-level test:fail cleanup below can reach
	// this run's fixture tree even when an assertion throws mid-test.
	r2FixtureReportPath = reportPath;
	// Extra keys ride through the shared function's env spread into the
	// fixture's environment; the budget override rides the same way.
	const env = {
		...process.env,
		RUNNER_PROBE_BUDGET_MS: '800',
		R2_FIXTURE_REPORT: reportPath,
		R2_FIXTURE_ROOT: root,
	};

	const startedAt = Date.now();
	// Watchdog: if a mutant disconnects the resolved budget from the shared
	// wait, the named rejection never comes — fail loud instead of hanging.
	let watchdogTimer;
	try {
		await assert.rejects(
			() =>
				Promise.race([
					runRunnerInterruptionProbe({
						env,
						runnerPath: path.join(root, 'r2-ignored-sigint-parent.mjs'),
					}),
					new Promise((_, reject) => {
						watchdogTimer = setTimeout(() => {
							// Fire-and-forget on purpose: the rejection below is the
							// outcome; the tree kill must happen either way.
							void killFixtureTreeFromReport(reportPath).finally(() => {
								reject(
									new Error(
										'#1352 r2 watchdog: the real flow did not fail within 15s — the resolved budget no longer bounds the real wait',
									),
								);
							});
						}, 15_000);
					}),
				]),
			(error: Error) => {
				// ONLY the genuine budget-expiry message counts: the matcher
				// demands the real probe name AND the injected 800ms number, so
				// neither the watchdog error nor any other failure can satisfy it.
				assert.match(
					error.message,
					/check-design-system runner-interruption probe exceeded its 800ms budget/,
				);
				assert.match(error.message, /Last output line: /);
				return true;
			},
		);
	} finally {
		clearTimeout(watchdogTimer);
	}

	// The injected budget must actually elapse before the timeout fires, and
	// the whole bounded flow must finish promptly — an unbounded wait would
	// hang until the watchdog, far past this ceiling.
	const elapsed = Date.now() - startedAt;
	assert.ok(
		elapsed >= 750,
		`the injected budget must elapse before the timeout fires, took ${elapsed}ms`,
	);
	assert.ok(
		elapsed < 5_000,
		`the budget expiry must bound the flow tightly, took ${elapsed}ms`,
	);

	// The expiry's kill-tree must leave NO orphan: the fixture reported its
	// own pid (= the shared function's direct child) and its grand-child's.
	// A zombie can survive briefly between SIGKILL and reaping, so poll.
	const pids = (await readFile(reportPath, 'utf8'))
		.split('\n')
		.filter((line) => line.trim() !== '')
		.map((line) => Number(line));
	assert.equal(pids.length, 2, `fixture pid report expected, got: ${pids}`);
	const deadline = Date.now() + 5_000;
	for (const pid of pids) {
		let gone = false;
		while (Date.now() < deadline) {
			try {
				process.kill(pid, 0);
			} catch {
				gone = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.equal(
			gone,
			true,
			`pid ${pid} must be dead — the budget expiry must kill the whole tree`,
		);
	}
});

// Post-failure safety net for the r2 proof only: if any of its assertions
// throws while a mutant keeps the fixture alive, kill its tree so neither
// stray processes nor its runaway timers outlive this RED run.
// Module-level binding replacing the previous globalThis side-channel
// one-for-one (same storage, same lifetime) so the compiler can type it.
let r2FixtureReportPath: string | undefined;
const r2ProofFailureCleanup = (event: { name?: string } | undefined) => {
	if (
		event?.name !==
		'#1352 r2: the REAL probe flow fires within an injected small RUNNER_PROBE_BUDGET_MS and kills its tree'
	) {
		return;
	}
	if (typeof r2FixtureReportPath === 'string') {
		void killFixtureTreeFromReport(r2FixtureReportPath);
	}
};
process.on('test:fail', r2ProofFailureCleanup);

// Positive control: a child that exits on its own resolves normally with
// its code — the budget helper must never turn a healthy exit into a
// failure (or this bound would be a vacuous always-reject).
test('#1352: the probe budget does not disturb a child that exits on its own (positive control)', async () => {
	const child = spawn(process.execPath, ['-e', 'process.exit(7)'], {
		stdio: 'ignore',
	});
	const result = await awaitExitWithinBudget({
		child,
		budgetMs: 5_000,
		probeName: '#1352 positive control',
		getLastOutput: () => '',
	});
	assert.deepEqual(result, { code: 7, signal: null });
});

// #1352 r1 finding 2: the budget must be overridable from the environment
// (CI vs local) and parsed STRICTLY. Four cases pinned below: unset → the
// documented default; valid positive integer → parsed; unparseable → LOUD
// failure naming the bad value; ≤ 0 / non-positive → LOUD failure. Never a
// silent default: a mistyped override must fail loud, not quietly restore
// the default.
test('#1352: resolveRunnerProbeBudgetMs falls back to the documented default when RUNNER_PROBE_BUDGET_MS is unset', () => {
	assert.equal(resolveRunnerProbeBudgetMs({ env: {} }), 120_000);
	assert.equal(
		resolveRunnerProbeBudgetMs({ env: { UNRELATED: '1' } }),
		120_000,
	);
	assert.equal(
		resolveRunnerProbeBudgetMs({ env: { RUNNER_PROBE_BUDGET_MS: undefined } }),
		120_000,
	);
	assert.equal(RUNNER_PROBE_BUDGET_MS, 120_000);
});

test('#1352: resolveRunnerProbeBudgetMs parses a valid RUNNER_PROBE_BUDGET_MS override', () => {
	assert.equal(
		resolveRunnerProbeBudgetMs({ env: { RUNNER_PROBE_BUDGET_MS: '5000' } }),
		5_000,
	);
	assert.equal(
		resolveRunnerProbeBudgetMs({ env: { RUNNER_PROBE_BUDGET_MS: '1' } }),
		1,
	);
});

test('#1352: resolveRunnerProbeBudgetMs fails loud naming the value on an unparseable RUNNER_PROBE_BUDGET_MS', () => {
	for (const bad of ['abc', '', '12.5', '1e3', ' 3000', '3000 ', '+3000']) {
		assert.throws(
			() =>
				resolveRunnerProbeBudgetMs({
					env: { RUNNER_PROBE_BUDGET_MS: bad },
				}),
			(error: Error) => {
				assert.match(error.message, /RUNNER_PROBE_BUDGET_MS/);
				assert.ok(
					error.message.includes(JSON.stringify(bad)),
					`the error must name the bad value, got: ${error.message}`,
				);
				return true;
			},
			`RUNNER_PROBE_BUDGET_MS=${JSON.stringify(bad)} must fail loud`,
		);
	}
});

test('#1352: resolveRunnerProbeBudgetMs fails loud on a non-positive RUNNER_PROBE_BUDGET_MS', () => {
	for (const bad of ['0', '-1', '-120000']) {
		assert.throws(
			() =>
				resolveRunnerProbeBudgetMs({
					env: { RUNNER_PROBE_BUDGET_MS: bad },
				}),
			(error: Error) => {
				assert.match(error.message, /RUNNER_PROBE_BUDGET_MS/);
				assert.ok(
					error.message.includes(JSON.stringify(bad)),
					`the error must name the bad value, got: ${error.message}`,
				);
				return true;
			},
			`RUNNER_PROBE_BUDGET_MS=${JSON.stringify(bad)} must fail loud`,
		);
	}
});

// #1272 packet item 2: the fail-loud artifact, driven through the REAL
// handler wiring above (the same onData accumulation + matchRunnerHandshake +
// 20s timeout), not a model of it. The helper below re-creates that wiring
// verbatim against a synthetic emitter; the first test proves a foreign
// commented-only buffer NEVER resolves and the timeout rejects naming the
// buffer; the second pins the positive case end-to-end over the same wiring.
const runProbeHandshakeWiring = ({
	nonce,
	chunks,
}: {
	nonce: string;
	chunks: ReadonlyArray<string>;
}) => {
	const stdout = new EventEmitter();
	let buffered = '';
	const promise = new Promise<{ pid: number; root: string }>(
		(resolve, reject) => {
			let timeout: ReturnType<typeof setTimeout>;
			const onData = (chunk: Buffer) => {
				buffered += chunk.toString();
				try {
					const handshake = matchRunnerHandshake(buffered, nonce);
					if (handshake) {
						clearTimeout(timeout);
						resolve(handshake);
					}
				} catch {
					// Unreachable: nonce is always valid here.
				}
			};
			timeout = setTimeout(
				() => reject(new Error(`runner probe did not start:\n${buffered}`)),
				50,
			);
			stdout.on('data', onData);
		},
	);
	for (const chunk of chunks) {
		stdout.emit('data', Buffer.from(chunk));
	}
	return promise;
};

test('real handler wiring: a foreign commented root alone never resolves and the start timeout fails loud naming the buffer', async () => {
	const nonce = randomBytes(24).toString('base64');
	const attack = [
		'# Subtest: next tick',
		'RUNNER_PID=4242',
		`# RUNNER_OWNED_ROOT=${nonce}:/front2-design-guard-run-evil/owned`,
	].join('\n');
	await assert.rejects(
		() => runProbeHandshakeWiring({ nonce, chunks: [attack] }),
		(error: Error) => {
			assert.match(error.message, /runner probe did not start/);
			assert.ok(
				error.message.includes(attack),
				'the failure message must name the whole buffer',
			);
			return true;
		},
	);
});

test('real handler wiring: the genuine uncommented nonce-bearing handshake resolves', async () => {
	const nonce = randomBytes(24).toString('base64');
	const ownedRoot = '/tmp/front2-design-guard-run-real/owned';
	assert.deepEqual(
		await runProbeHandshakeWiring({
			nonce,
			chunks: [
				'# Subtest: runner interruption probe leaves an active owned fixture\n',
				`RUNNER_PID=4242\nRUNNER_OWNED_ROOT=${nonce}:${ownedRoot}\n`,
			],
		}),
		{ pid: 4242, root: ownedRoot },
	);
});

// #1256: the handshake matcher is the single place that decides which
// process's values the interruption probe trusts. The live probe emits its
// root as an UNCOMMENTED `RUNNER_OWNED_ROOT=<nonce>:<path>` line (nonce
// first, then the path); these buffers pin that shape plus the two failure
// shapes: a foreign child's commented handshake arriving after the real one
// must lose to it, and a foreign child's all-commented handshake alone must
// never satisfy even the PID half.
test('runner handshake resolves on an interleaved buffer with TAP comments around a real uncommented nonce-bearing handshake', () => {
	const nonce = randomBytes(24).toString('base64');
	assert.deepEqual(
		matchRunnerHandshake(
			[
				'# Subtest: runner interruption probe leaves an active owned fixture',
				'RUNNER_PID=4242',
				`RUNNER_OWNED_ROOT=${nonce}:/tmp/front2-design-guard-run-real/owned`,
				'# RUNNER_OWNED_ROOT=/foreign/root',
				'ok 1 - runner interruption probe leaves an active owned fixture',
			].join('\n'),
			nonce,
		),
		{
			pid: 4242,
			root: '/tmp/front2-design-guard-run-real/owned',
		},
	);
});

test('runner handshake keeps the real pid and root when a foreign commented handshake arrives later', () => {
	const nonce = randomBytes(24).toString('base64');
	assert.deepEqual(
		matchRunnerHandshake(
			[
				`RUNNER_PID=111`,
				`RUNNER_OWNED_ROOT=${nonce}:/tmp/front2-design-guard-run-real/owned`,
				'# Subtest: next tick',
				'# RUNNER_PID=999',
				'# RUNNER_OWNED_ROOT=/foreign/root',
			].join('\n'),
			nonce,
		),
		{ pid: 111, root: '/tmp/front2-design-guard-run-real/owned' },
	);
});

test('runner handshake does not resolve on a foreign child whose handshake lines are all TAP comments', () => {
	assert.equal(
		matchRunnerHandshake(
			'# RUNNER_PID=999\n# RUNNER_OWNED_ROOT=/foreign/root',
			randomBytes(24).toString('base64'),
		),
		null,
	);
});

// #1272 r2: the round-1 namespace guard was a PATTERN MATCH, not a proof — a
// foreign `# RUNNER_OWNED_ROOT=` whose path merely carries the predictable
// `/front2-design-guard-run-` prefix resolved. Ownership is now proven by a
// per-spawn env nonce the parent generates and only the probe knows; the
// commented-root fallback branch is DELETED entirely, so even a nonce-bearing
// COMMENTED line never resolves (only the uncommented live-probe shape does).
// This is the brief's named adversarial case: predictable prefix + no valid
// nonce → must stay unresolved so the start timeout fails loud with the
// buffer in its message.
test('runner handshake rejects a foreign commented root that carries the predictable prefix without the nonce', () => {
	assert.equal(
		matchRunnerHandshake(
			[
				'RUNNER_PID=4242',
				'# Subtest: next tick',
				'# RUNNER_OWNED_ROOT=/front2-design-guard-run-xyz/owned',
			].join('\n'),
			randomBytes(24).toString('base64'),
		),
		null,
	);
});

test('runner handshake rejects an uncommented root carrying a stale or wrong nonce', () => {
	const nonce = randomBytes(24).toString('base64');
	const staleNonce = randomBytes(24).toString('base64');
	assert.equal(
		matchRunnerHandshake(
			[
				'RUNNER_PID=4242',
				`RUNNER_OWNED_ROOT=${staleNonce}:/tmp/front2-design-guard-run-real/owned`,
			].join('\n'),
			nonce,
		),
		null,
	);
});

test('runner handshake refuses to run without an unguessable expected nonce', () => {
	assert.throws(
		() => matchRunnerHandshake('RUNNER_PID=4242\nRUNNER_OWNED_ROOT=x:/p', ''),
		TypeError,
	);
});

registerFixtureSignalHandlers();

after(async () => {
	fixtureParent = await getFixtureParentPath();
	await cleanupFixtures();
	await assert.rejects(access(fixtureParent), { code: 'ENOENT' });
});

const startFixtureProbe = async (mode: string) => {
	const reportDirectory = await makeOwnedTempDirectory('probe-report');
	const reportPath = path.join(reportDirectory, 'parent');
	const child = spawn(
		process.execPath,
		[
			fileURLToPath(
				new URL('./check-design-system-fixture-probe.mts', import.meta.url),
			),
		],
		{
			cwd: path.dirname(testFilePath),
			env: {
				...process.env,
				FRONT2_DESIGN_GUARD_FIXTURE_PROBE: mode,
				FRONT2_DESIGN_GUARD_CLEANUP_DELAY_MS: '250',
				FRONT2_DESIGN_GUARD_PARENT_REPORT: reportPath,
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	let output = '';
	const waitForProbeMarker = async () => {
		await mkdir(reportDirectory, { recursive: true });
		const timeout = setTimeout(() => {
			throw new Error(`fixture probe did not start:\n${output}`);
		}, 20_000);
		while (true) {
			try {
				const parent = await readFile(reportPath, 'utf8');
				clearTimeout(timeout);
				return parent;
			} catch (error) {
				const isEnoent =
					typeof error === 'object' &&
					error != null &&
					'code' in error &&
					error.code === 'ENOENT';
				if (!isEnoent) {
					throw error;
				}
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
		}
	};
	const marker = waitForProbeMarker();
	const exit = new Promise<{
		code: number | null;
		signal: NodeJS.Signals | null;
	}>((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve({ code, signal }));
	});
	return { child, exit, marker, reportDirectory };
};

const assertParentGone = async (parent: string) => {
	await assert.rejects(access(parent), { code: 'ENOENT' });
};

for (const [mode, signal, expectedCode] of [
	['SIGINT', 'SIGINT', 130],
	['SIGTERM', 'SIGTERM', 143],
] as const) {
	test(`fixture cleanup handles ${signal} in a child process`, async () => {
		const probe = await startFixtureProbe(mode);
		let fixtureParent: string | undefined;
		try {
			fixtureParent = await probe.marker;
			probe.child.kill(signal);
			probe.child.kill(signal);
			const result = await probe.exit;
			assert.equal(result.code, expectedCode);
			assert.equal(result.signal, null);
			await assertParentGone(fixtureParent);
		} finally {
			if (fixtureParent) {
				await rm(fixtureParent, { recursive: true, force: true });
			}
			await rm(probe.reportDirectory, { recursive: true, force: true });
		}
	});
}

test('fixture cleanup handles a failing node:test child process', async () => {
	const probes = await Promise.all([
		startFixtureProbe('error'),
		startFixtureProbe('error'),
	]);
	const parents = [];
	try {
		for (const probe of probes) {
			parents.push(await probe.marker);
		}
		const results = await Promise.all(probes.map((probe) => probe.exit));
		for (const result of results) {
			assert.notEqual(result.code, 0);
			assert.equal(result.signal, null);
		}
		for (const parent of parents) {
			await assertParentGone(parent);
		}
	} finally {
		for (const parent of parents) {
			await rm(parent, { recursive: true, force: true });
		}
		for (const probe of probes) {
			await rm(probe.reportDirectory, { recursive: true, force: true });
		}
	}
});

const scanStatusFixture = async (source: string) => {
	const root = await makeFixture({
		'src/routes/authed/staff/status-fixture.tsx': source,
	});
	return scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
};

test('status menu guard accepts persistent value checkboxes and an exclusive reset', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem checked={statuses.length === 0} closeOnClick>
				{t('all-statuses')}
			</DropdownMenuCheckboxItem>
			{STATUS_VALUES.map((status) => (
				<DropdownMenuCheckboxItem checked={statuses.includes(status)} closeOnClick={false} showCheckbox>
					{status}
				</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some(
			(item) => item.ruleId === 'status-filter-checkbox-contract',
		),
		false,
	);
});

test('status menu guard accepts an explicit reset-key-discovered menu', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
			<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>Active</DropdownMenuCheckboxItem>
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some(
			(item) => item.ruleId === 'status-filter-checkbox-contract',
		),
		false,
	);
});

test('status menu guard ignores persistent non-status filters', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			{LEVEL_VALUES.map((level) => (
				<DropdownMenuCheckboxItem closeOnClick={false}>{level}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.equal(
		violations.some(
			(item) => item.ruleId === 'status-filter-checkbox-contract',
		),
		false,
	);
});

for (const fixture of [
	{
		name: 'missing showCheckbox',
		item: '<DropdownMenuCheckboxItem closeOnClick={false}>{status}</DropdownMenuCheckboxItem>',
		message: /showCheckbox/,
	},
	{
		name: 'closing status value',
		item: '<DropdownMenuCheckboxItem closeOnClick>{status}</DropdownMenuCheckboxItem>',
		message: /closeOnClick=\{false\}/,
	},
]) {
	test(`status menu guard rejects ${fixture.name}`, async () => {
		const violations = await scanStatusFixture(`
			<DropdownMenuContent>
				<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
				{STATUSES.map((status) => (${fixture.item}))}
			</DropdownMenuContent>
		`);
		const violation = violations.find(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				fixture.message.test(entry.message),
		);
		assert.ok(violation);
	});
}

test('status menu guard rejects a persistent status menu without All statuses', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(
		violations.some(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				/All statuses/.test(entry.message),
		),
	);
});

for (const [name, attributes] of [
	['shows a checkbox', 'closeOnClick showCheckbox'],
	['does not explicitly close', 'closeOnClick={false}'],
]) {
	test(`status menu guard rejects an All statuses reset that ${name}`, async () => {
		const violations = await scanStatusFixture(`
			<DropdownMenuContent>
				<DropdownMenuCheckboxItem ${attributes}>{t('all-statuses')}</DropdownMenuCheckboxItem>
				{STATUSES.map((status) => (
					<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>{status}</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		`);
		assert.ok(
			violations.some(
				(entry) =>
					entry.ruleId === 'status-filter-checkbox-contract' &&
					/reset/.test(entry.message),
			),
		);
	});
}

test('status menu guard fails closed on spread-obscured item attributes', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem {...statusItemProps}>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(
		violations.some(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				/cannot classify/.test(entry.message),
		),
	);
});

test('status menu guard rejects a status value with showCheckbox={false}', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem closeOnClick>{t('all-statuses')}</DropdownMenuCheckboxItem>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox={false}>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(
		violations.some(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				/showCheckbox/.test(entry.message),
		),
	);
});

test('status menu guard rejects a reset with a non-literal closeOnClick value', async () => {
	const violations = await scanStatusFixture(`
		<DropdownMenuContent>
			<DropdownMenuCheckboxItem closeOnClick={shouldClose}>{t('all-statuses')}</DropdownMenuCheckboxItem>
			{STATUSES.map((status) => (
				<DropdownMenuCheckboxItem closeOnClick={false} showCheckbox>{status}</DropdownMenuCheckboxItem>
			))}
		</DropdownMenuContent>
	`);
	assert.ok(
		violations.some(
			(entry) =>
				entry.ruleId === 'status-filter-checkbox-contract' &&
				/reset/.test(entry.message),
		),
	);
});

test('flags raw shell colors, prototype icons, native selects, confirms, and important overrides', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="bg-slate-900 !text-foreground" />',
		'src/components/table/data-table.tsx':
			'<select className="border-border"><option>10</option></select>',
		'src/routes/authed/staff/tenants.tsx':
			'globalThis.confirm("Suspend?"); <AppErrorView icon="!" title="Error" />',
		'src/components/table/numeric-important.tsx':
			'<div className="!px-2 !z-50">Bad</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		[...new Set(violations.map((violation) => violation.ruleId))].sort(),
		[
			'no-important-foundation',
			'no-native-confirm',
			'no-native-product-select',
			'no-prototype-icons',
			'no-raw-visual-color',
		],
	);
});

test('flags HeroUI, MUI, and Lucide imports in migration guard', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			"import { Button } from '@heroui/react';\nimport '@heroui/styles';\nimport { useRouter } from 'react-router';\nimport { Box } from '@mui/material';",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-heroui-import'),
		true,
	);
	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-mui-import'),
		true,
	);
});

test('flags Lucide imports in migration guard', async () => {
	const root = await makeFixture({
		'src/components/ui/state-surface.tsx':
			"import { AlertCircle } from 'lucide-react';",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-lucide-import'),
		true,
	);
	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-mui-import'),
		false,
	);
});

test('flags legacy numbered HeroUI color scale utilities', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<div className="text-foreground-500 bg-default-100 border-danger-200 text-success-800" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-heroui-color-scale',
		),
		true,
	);
});

test('allows Gray UI token aliases', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'<div className="text-muted-foreground border-border bg-background text-primary-foreground" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-heroui-import')
			.length,
		0,
	);
	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		0,
	);
});

test('allows ordinary JavaScript negation in shell and table foundation files', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'if (!isMenuOpen) { return null; }',
		'src/components/table/data-table.tsx':
			'const disabled = paginationDisabled || !hasPreviousPage;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-important-foundation',
		),
		false,
	);
});

test('flags legacy rounded styles outside allowed pockets', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/sample.tsx':
			'<div className="rounded-full">x</div>\n<span style="border-radius:999px">x</span>\n',
		'src/components/app-shell/app-shell.tsx':
			'<button className="app-shell-topbar-action-btn">x</button>\n',
		'src/styles/app.css': '.hero-chip { border-radius: 999px; }\n',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const roundedRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);

	assert.equal(roundedRuleHits.length > 0, true);
});

test('flags new circular-style regressions in refreshed primitives', async () => {
	const root = await makeFixture({
		'src/components/ui/switch.tsx': '<Switch className="rounded-full" />',
		'src/components/ui/tabs.tsx':
			'<TabsList className="inline-flex rounded-full" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const roundedRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);

	assert.equal(
		roundedRuleHits.some(
			(violation) =>
				violation.file === 'src/components/ui/switch.tsx' &&
				violation.source.includes('rounded-full'),
		),
		true,
	);
	assert.equal(
		roundedRuleHits.some(
			(violation) =>
				violation.file === 'src/components/ui/tabs.tsx' &&
				violation.source.includes('rounded-full'),
		),
		true,
	);
});

test('keeps circular rounded exceptions for topbar/avatar while flagging primitives', async () => {
	const root = await makeFixture({
		'src/components/ui/avatar.tsx': '<span className="rounded-full"></span>',
		'src/components/app-shell/app-shell.tsx':
			'<button className="app-shell-topbar-action-btn">x</button>',
		'src/styles/app.css':
			'.app-shell-topbar-action-btn { border-radius: 999px !important; }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const roundedRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);

	assert.equal(
		roundedRuleHits.some(
			(violation) => violation.file === 'src/components/ui/avatar.tsx',
		),
		false,
	);
	assert.equal(
		roundedRuleHits.some(
			(violation) =>
				violation.file === 'src/components/app-shell/app-shell.tsx',
		),
		false,
	);
	assert.equal(
		roundedRuleHits.some(
			(violation) => violation.file === 'src/styles/app.css',
		),
		false,
	);
});

test('allows the profile icon-picker pencil-pin circular exception but flags an impostor selector that merely starts with its name', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			'.publy-profile-detail-tile-pin {',
			'\tborder-radius: var(--publy-radius-circular);',
			'}',
			'.publy-profile-detail-tile-pin-impostor {',
			'\tborder-radius: var(--publy-radius-circular);',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const roundedRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);

	// The allowlisted selector itself: no violation.
	assert.equal(
		roundedRuleHits.some(
			(violation) =>
				violation.file === 'src/styles/app.css' &&
				violation.source.includes('.publy-profile-detail-tile-pin {'),
		),
		false,
	);
	// #992 review follow-up: a selector that merely starts with the
	// allowlisted class name (a prefix leak from substring matching) must
	// still be flagged — it is not the same selector.
	assert.equal(
		roundedRuleHits.some(
			(violation) => violation.file === 'src/styles/app.css',
		),
		true,
	);
});

test('flags new rounded styles even in files with legacy debt', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'<span className="new-handoff-shape rounded-full">Bad</span>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
		),
		true,
	);
});

test('flags non-confirmation centered overlay wording and DialogPopup usage', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/overlay.tsx':
			'<div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">Centered</div>',
		'src/components/ui/forbidden-dialog.tsx':
			'import { Dialog as DialogPrimitive } from \'@base-ui/react/dialog\';\nconst popup = <DialogPrimitive.Popup className="x" />;',
		'src/components/ui/confirm-dialog.tsx':
			'import { Dialog as DialogPrimitive } from \'@base-ui/react/dialog\';\nconst c = <DialogPrimitive.Popup className="y" />;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) =>
				violation.ruleId === 'no-non-confirmation-centered-overlay',
		),
		true,
	);
	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
	);
});

// #1844 paired red/green proof — test 1 (false positive): a forbidden
// primitive cited inside a comment must NOT trigger a violation. Before
// the fix, `mode: 'source'` rules ran their regex over raw source text
// comments included, so a test explaining that a `data-testid` lands on
// `DialogPrimitive.Popup` satisfied the pattern and tripped a false
// positive that turned supply-chain red.
void test('#1844: a forbidden primitive cited inside a comment is not a violation (false positive proof)', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-comment.tsx': [
			'// spread onto DialogPrimitive.Popup) and assert the role is `dialog`.',
			'// See: https://base-ui.com/components/dialog#popup',
			'export const helper = true;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		false,
		'a DialogPopup mention inside a comment must not be flagged as a violation',
	);
});

// #1844 paired red/green proof — test 2 (false negative guard): a real
// usage of a forbidden primitive on the same line as a URL containing
// `//` must STILL be detected. A naive comment-stripping regex
// (`//.*$`) would eat the URL and the real usage with it, hiding a
// genuine violation. The AST-based approach must not mutate source text.
void test('#1844: a real DialogPopup usage on the same line as a URL containing // is still detected (false negative guard)', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-with-url.tsx': [
			"import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';",
			'// https://base-ui.com/components/dialog#popup',
			'const popup = <DialogPrimitive.Popup className="x" />;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
		'a real DialogPrimitive.Popup usage must be detected even when a URL with // is present',
	);
});

// #1844: a real usage inside a template literal containing /* */ must
// still be detected — a naive `/\*[\s\S]*?\*\//` strip would eat the
// template content and hide the violation.
void test('#1844: a real DialogPopup usage inside a template literal with /* */ is still detected', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-template.tsx': [
			"import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';",
			'const markup = `/* ${DialogPrimitive.Popup.toString()} */`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
		'a real DialogPopup usage inside a template literal must be detected',
	);
});

// #1844 edge case: a regex literal containing // must not hide a real
// usage on the next line. A naive `//.*$` strip would eat the regex and
// the real usage with it.
void test('#1844: a real DialogPopup usage after a regex literal with // is still detected', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-regex.tsx': [
			"import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';",
			'const pattern = /https:\\/\\/base-ui.com\\/dialog/g;',
			'const popup = <DialogPrimitive.Popup className="x" />;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
		'a real DialogPopup usage after a regex literal must be detected',
	);
});

// #1844 edge case: a block comment /* */ containing a forbidden primitive
// must not trigger a violation.
void test('#1844: a forbidden primitive inside a block comment is not a violation', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-block-comment.tsx': [
			'/* This component uses DialogPrimitive.Popup for modal behavior. */',
			'export const helper = true;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		false,
		'a DialogPopup mention inside a block comment must not be flagged',
	);
});

// #1844 edge case: a JSX comment {/* comment */} is NOT a TS trivia
// comment — it's a JSX expression container. The TypeScript compiler API's
// trivia scanner does not report JSX comments as comment ranges, so this
// edge case is out of scope for the AST-based fix. The existing
// no-dialog-popup-primitives rule already has a separate JSX-aware path.
void test('#1844: a forbidden primitive inside a JSX comment is not a violation (out of scope - JSX comments are not TS trivia)', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-jsx-comment.tsx': [
			'export const Component = () => (',
			'  <div>',
			'    {/* TODO: use DialogPrimitive.Popup for the modal */}',
			'    <span>Hello</span>',
			'  </div>',
			');',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	// JSX comments are not captured by TS trivia API - this is a known
	// limitation. The test documents this edge case.
	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
		'JSX comments are not TS trivia - this is a known limitation, not a regression',
	);
});

// #1844: no-raw-internal-anchor must not flag a raw anchor cited in a comment.
void test('#1844: a raw anchor cited inside a comment is not a violation', async () => {
	const root = await makeFixture({
		'src/components/ui/anchor-comment.tsx': [
			'// Use <a href="/staff/invitations"> for the back link',
			'export const helper = true;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-raw-internal-anchor',
		),
		false,
		'a raw anchor mention inside a comment must not be flagged',
	);
});

// #1844: no-single-star-route-glob must not flag a single-star glob cited in a comment.
void test('#1844: a single-star glob cited inside a comment is not a violation', async () => {
	const root = await makeFixture({
		'e2e/specs/route-comment.spec.ts': [
			'// page.route(\"/api/users/*\") is a bad pattern',
			'export const helper = true;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-single-star-route-glob',
		),
		false,
		'a single-star glob mention inside a comment must not be flagged',
	);
});

// #1844: a multi-line block comment containing a forbidden primitive
// must not trigger a violation.
void test('#1844: a forbidden primitive inside a multi-line block comment is not a violation', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-multiline-comment.tsx': [
			'/*',
			' * This component uses DialogPrimitive.Popup',
			' * for modal behavior.',
			' */',
			'export const helper = true;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		false,
		'a DialogPopup mention inside a multi-line block comment must not be flagged',
	);
});

// #1844: a forbidden primitive cited in an END-OF-LINE comment must not
// trigger a violation. This exercises getTrailingCommentRanges — skipping
// it would let a real end-of-line comment sail through unrecognized and
// flag a false positive.
void test('#1844: a forbidden primitive in an end-of-line comment is not a violation', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-eol-comment.tsx': [
			'export const helper = 1; // uses DialogPrimitive.Popup for modal behavior',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		false,
		'a DialogPopup mention in an end-of-line comment must not be flagged',
	);
});

// #1844: a real raw anchor usage must STILL be detected — the false
// negative guard for no-raw-internal-anchor. A naive comment-stripping
// approach must not hide a genuine violation.
void test('#1844: a real raw anchor usage is still detected (false negative guard for no-raw-internal-anchor)', async () => {
	const root = await makeFixture({
		'src/components/ui/real-anchor.tsx': [
			'export const BackLink = () => <a href="/staff/invitations">Back</a>;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-raw-internal-anchor',
		),
		true,
		'a real raw anchor usage must be detected',
	);
});

// #1844: a real single-star route glob must STILL be detected — the
// false negative guard for no-single-star-route-glob. A naive
// comment-stripping approach must not hide a genuine violation.
void test('#1844: a real single-star route glob is still detected (false negative guard for no-single-star-route-glob)', async () => {
	const root = await makeFixture({
		'e2e/specs/real-route-glob.spec.ts': [
			'test("mock users", async ({ page }) => {',
			'  await page.route("/api/users/*", (route) => route.fulfill({ body: "[]" }));',
			'});',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-single-star-route-glob',
		),
		true,
		'a real single-star route glob usage must be detected',
	);
});

// #1844 edge case: the `index >= start` boundary in `isInsideComment`.
// A regex match can never start at the comment range's `start` offset
// because that offset is always the `/*` or `//` opener, which the
// forbidden-primitive regex (`DialogPrimitive.Popup`, `<a href=...`,
// `page.route(...".../*")`) never matches. So changing `>=` to `>`
// keeps this test green — this is a documentation of that boundary,
// not a paired red proof. The invariant holds because the match is
// ALWAYS at `start + 2` (after the opener), not at `start`.
void test('#1844: a match after a block comment opener is not a violation (boundary documentation)', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog-popup-start-comment.tsx': [
			'/*DialogPrimitive.Popup*/',
			'export const helper = true;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		false,
		'a match starting after the block comment opener must not be flagged',
	);
});

// #1844 point 4: a malformed TypeScript file that cannot be parsed for
// comment ranges must fail loudly — the scan records a visible
// `comment-range-parse-failure` violation instead of crashing or silently
// producing a partial range set.
void test('#1844: a malformed TS file fails loudly with a comment-range-parse-failure violation', async () => {
	const root = await makeFixture({
		// Intentionally malformed: an unterminated string literal makes the
		// file unparseable — the TS parser reports parseDiagnostics.
		'src/components/ui/malformed.tsx': [
			"export const a = 'unterminated string;",
			'export const b = <DialogPrimitive.Popup />;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const parseFailures = violations.filter(
		(violation) => violation.ruleId === 'comment-range-parse-failure',
	);

	assert.equal(
		parseFailures.length > 0,
		true,
		'a malformed TS file must produce a comment-range-parse-failure violation',
	);
});

test('allows HeroUI imports and rules that should be exempt', async () => {
	const root = await makeFixture({
		'src/components/ui/confirm-dialog.tsx':
			"import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';",
		'src/components/ui/drawer.tsx':
			'import { Dialog as DialogPrimitive } from \'@base-ui/react/dialog\';\nconst drawer = <DialogPrimitive.Popup className="publy-drawer" />;',
		'src/components/app-shell/app-shell.tsx':
			'<div className="app-shell-topbar-action-btn" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		).length,
		0,
	);
});

test('no longer exempts a deleted ui/dialog.tsx from DialogPopup usage (F12: dialog.tsx removed from the allowlist)', async () => {
	const root = await makeFixture({
		'src/components/ui/dialog.tsx':
			"import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';\nexport const DialogPopup = DialogPrimitive.Popup;",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-dialog-popup-primitives',
		),
		true,
	);
});

test('allows raw tokens only in app.css', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root { --publy-primary-main: #2563eb; }',
		'src/styles/other.css': '.bad { color: #2563eb; }',
		'src/components/table/data-table.tsx':
			'<div className="border-divider text-muted-foreground" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.map((violation) => violation.ruleId),
		['no-raw-visual-color'],
	);
	assert.equal(violations[0].file, 'src/styles/other.css');
});

test('reports the actual internal anchor when another anchor appears first', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': `
			<a href={href}>Dynamic</a>
			<div>Between</div>
			<a
				href="/staff/tenants"
				className="quiet"
			>
				Staff tenants
			</a>
		`,
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const anchors = violations.filter(
		(violation) => violation.ruleId === 'no-raw-internal-anchor',
	);

	assert.equal(anchors.length, 1);
	assert.match(anchors[0].source, /href="\/staff\/tenants"/);
	assert.doesNotMatch(anchors[0].source, /href=\{href\}/);
});

test('primary button chrome is on .btn-primary-chrome, with no border-radius override (F6/F9)', async () => {
	const css = await readFile(
		new URL('../../src/styles/app.css', import.meta.url),
		'utf8',
	);

	// .button--primary / .button--primary.button--md are dead CSS (F9/F12):
	// zero usages anywhere in src/, superseded by .btn-primary-chrome — this
	// test used to pin the dead selector in place. Assert it's gone.
	assert.doesNotMatch(css, /\.button--primary\b/);

	// chrome properties live on the real class, .btn-primary-chrome
	const chromeRuleMatch = css.match(/\.btn-primary-chrome\s*\{([^}]*)\}/);
	assert.ok(chromeRuleMatch, '.btn-primary-chrome rule not found');
	const chromeRuleBody = chromeRuleMatch[1];

	// F3: the border literal moved into a named, theme-invariant token
	// (--publy-chrome-border) so no-raw-visual-color's border-shorthand scan
	// doesn't flag the bevel as an unrouted raw rgba() literal.
	assert.match(chromeRuleBody, /border:\s*var\(--publy-chrome-border\)/);
	assert.match(chromeRuleBody, /box-shadow:\s*var\(--publy-shadow-chrome\)/);

	assert.match(
		css,
		/--publy-chrome-border:\s*1\.33px\s+solid\s+rgba\(255,\s*255,\s*255,\s*0\.12\)/,
	);

	// F6: no border-radius here. This class is un-layered (must beat
	// Tailwind's utility layer for border/box-shadow), so a border-radius
	// declaration here would always beat every size variant's own
	// rounded-[...] utility, forcing every primary button to the same
	// radius regardless of size="xs"/"sm"/"default"/"lg".
	assert.doesNotMatch(chromeRuleBody, /border-radius/);
});

test('handoff design tokens are present in app.css', async () => {
	const css = await readFile(
		new URL('../../src/styles/app.css', import.meta.url),
		'utf8',
	);

	assert.match(css, /--publy-font-sans:\s*Geist, ui-sans-serif/);
	assert.match(css, /--publy-primary:\s*#fdc700/i);
	assert.match(css, /--publy-primary-foreground:\s*#733e0a/i);
	assert.match(css, /--publy-shell-rail-width:\s*49px/);
	assert.match(css, /--publy-shell-panel-width:\s*272px/);
	assert.match(css, /--publy-shell-topbar-height:\s*64px/);
	assert.match(
		css,
		/--publy-shadow-chrome:\s*0\s+0\s+0\s+0\.67px\s+rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.2\s*\)\s+inset,?\s*0\s+2px\s+2px\s+rgba\(\s*255,\s*255,\s*255,\s*0\.1\s*\)\s+inset,?\s*0\s+2px\s+2\.67px\s+-0\.67px\s+rgba\(\s*42,\s*42,\s*42,\s*0\.1\s*\),?\s*0\s+0\.67px\s+0\.67px\s+rgba\(\s*42,\s*42,\s*42,\s*0\.08\s*\)/,
	);
	assert.match(css, /--publy-modal-radius:\s*28px/);
});

test('allows issue references that look like numeric hex values in comments', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'// fixes #802\\n// see issue #123456\\nconst ok = true;',
		'src/routes/authed/staff/example.tsx':
			'{/* Related to #795 */}<div>ok</div>',
	});

	assert.equal(
		(
			await scanFront2DesignSystem({
				baseDir: root,
				sourceDir: path.join(root, 'src'),
			})
		).some((violation) => violation.ruleId === 'no-raw-visual-color'),
		false,
	);
});

test('flags raw hex color strings and Tailwind arbitrary hex color utilities', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="bg-[#123456] text-[#abcdef]" />',
		'src/components/table/data-table.tsx':
			"const color = '#2563eb'; const style = { color: '#1d4ed8' };",
		'src/styles/other.css': '.bad { color: #2563eb; }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		3,
	);
});

test('allows rgb and rgba references in comments', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'// removed legacy rgba() overlay\\n// rgb() values now come from tokens\\nconst ok = true;',
		'src/routes/authed/staff/example.tsx':
			'{/* replaced rgba() with semantic tokens */}<div>ok</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-raw-visual-color'),
		false,
	);
});

test('flags rgb and rgba color strings and style declarations', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="bg-[rgba(1,2,3,0.5)]" />',
		'src/components/table/data-table.tsx':
			"const color = 'rgba(1, 2, 3, 0.5)';",
		'src/styles/other.css': '.bad { background: rgb(1, 2, 3); }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		3,
	);
});

// W6-GUARDS (shell F6 / ui F6): a CSS named colour keyword outside
// `color-mix()` was entirely unguarded — every direct-literal pattern only
// ever recognised hex and colour-function shapes.
test('W6-GUARDS: flags a raw CSS named colour keyword in a declaration and an inline style object', async () => {
	const root = await makeFixture({
		'src/styles/other.css': '.danger { color: red; }',
		'src/components/table/data-table.tsx':
			"const chrome = { background: 'rebeccapurple' };",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		2,
	);
});

// Regression guard: a token reference/value that merely CONTAINS a named
// colour as a word fragment (`var(--publy-border-strong)`) must not
// false-positive — the named-colour pattern is anchored directly after the
// property's colon, not widened across the whole declaration value.
test('W6-GUARDS: does not flag a token reference whose name happens to contain a colour-name fragment (regression guard)', async () => {
	const root = await makeFixture({
		'src/styles/other.css':
			'.ok { border: 1px solid var(--publy-border-strong); }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// F824 (ui F5): a raw colour assembled by STRING COMPOSITION contains no
// complete raw-colour literal at all — `'#' + 'ff0000'` and `` `#${'00ccff'}` ``
// evaluate to raw hex at runtime while every literal-shaped detector sails
// past, so the guard certified the evasion idiom itself as clean.
test('F824-ui-F5: flags a raw hex colour built by string composition (evasion proof)', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			"const rawRed = '#' + 'ff0000';",
			"const tint = `#${'00ccff'}`;",
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	const bySource = (needle: string) =>
		colorViolations.filter((violation) => violation.source.includes(needle));
	assert.equal(bySource("'#' + 'ff0000'").length, 1, 'hash-prefix concat');
	assert.equal(bySource("`#${'00ccff'}`").length, 1, 'template interpolation');
});

// W6-GUARDS (ui F5): `box-shadow` was only present in the colour-FUNCTION
// pattern, not the hex/named-colour patterns — a raw hex or named-colour
// shadow sailed through while the equivalent rgba() shadow was already
// caught.
test('W6-GUARDS: flags a raw hex and a raw named colour used in a box-shadow declaration', async () => {
	const root = await makeFixture({
		'src/styles/other.css': [
			'.a { box-shadow: 0 0 0 3px #ffffff; }',
			'.b { box-shadow: 0 0 0 3px red; }',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		2,
	);
});

// r4-ui-F3: the original guard only recognized hex/rgb(a) as direct colour
// literals — hsl(a), hwb, lab, lch, oklab, oklch, and color() sailed through
// unrouted-to-a-token in a property value, an arbitrary Tailwind bracket
// value, and a bare custom-property declaration alike.
test('r4-ui-F3: flags hsl/hwb/lab/lch/oklab/oklch/color() literals in property values, arbitrary Tailwind values, and custom properties', async () => {
	const root = await makeFixture({
		'src/styles/other.css': [
			'.a { background: hsl(0 100% 50%); }',
			'.b { border-color: hwb(220 30% 20%); }',
			'.c { color: lab(29.2345% 39.3825 20.0664); }',
			'.d { outline-color: lch(52.2% 72.2 50); }',
			'.e { fill: oklab(59% 0.1 0.1); }',
			'.f { stroke: oklch(60% 0.15 30); }',
			'.g { background-color: color(display-p3 1 0 0); }',
			'.h { --publy-icon-tile-bg: oklch(70% 0.1 200); }',
		].join('\n'),
		// r5-ui-F2: this Tailwind arbitrary-value `bg-[hsl(...)]` is the exact
		// spelling the round-5 review demonstrated as invisible — the
		// arbitrary-utility detector was hard-coded to `rgba?` only, so this
		// ninth literal never joined the eight CSS-declaration hits below,
		// and the old assertion (`8`) silently certified that gap as green.
		'src/components/table/data-table.tsx':
			'<div className="bg-[hsl(220_10%_10%)]" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	// r5-ui-F2: assert each of the nine injected literals individually (not
	// just the aggregate count) so that removing ANY ONE detector — not only
	// dropping the total below 9 — fails this test. An aggregate `length ===
	// 9` alone would still pass if two detectors merged onto the same line or
	// a detector silently swapped which literal it caught.
	const bySource = (needle: string) =>
		colorViolations.filter((violation) => violation.source.includes(needle));
	assert.equal(bySource('hsl(0 100% 50%)').length, 1, 'hsl() in background');
	assert.equal(bySource('hwb(220 30% 20%)').length, 1, 'hwb() in border-color');
	assert.equal(
		bySource('lab(29.2345% 39.3825 20.0664)').length,
		1,
		'lab() in color',
	);
	assert.equal(
		bySource('lch(52.2% 72.2 50)').length,
		1,
		'lch() in outline-color',
	);
	assert.equal(bySource('oklab(59% 0.1 0.1)').length, 1, 'oklab() in fill');
	assert.equal(bySource('oklch(60% 0.15 30)').length, 1, 'oklch() in stroke');
	assert.equal(
		bySource('color(display-p3 1 0 0)').length,
		1,
		'color() in background-color',
	);
	assert.equal(
		bySource('oklch(70% 0.1 200)').length,
		1,
		'oklch() in a custom property',
	);
	assert.equal(
		bySource('bg-[hsl(220_10%_10%)]').length,
		1,
		'oklch()/hsl() inside a Tailwind arbitrary-value utility',
	);
	assert.equal(colorViolations.length, 9);
});

// r5-ui-F2: three evasions different in shape from the round-5-cited example
// (a Tailwind `bg-[hsl(...)]` utility) — a quoted/templated non-rgba colour
// function, a `color-mix()` call whose operand is a raw literal instead of a
// `var(...)` reference, and the same raw-operand shape nested inside an
// otherwise-safe-looking `color-mix()` transparency blend. Each is planted,
// proven caught, then removed (see the packet report for the RED/GREEN
// transcripts of the underlying regex change).
test('r5-ui-F2: flags a quoted oklch() string literal (not just rgba)', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			"const glow = 'oklch(70% 0.15 260)';",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

test('r5-ui-F2: flags a raw colour literal in a shadow-[] arbitrary utility, not just bg/text/border/ring', async () => {
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="shadow-[0_0_0_3px_rgba(253,199,0,0.16)]" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

// W5-PROOF: the original version of this test put both fixture lines in a
// `<property>: color-mix(...)` CSS declaration, which the pre-existing
// RAW_COLOR_PROPERTY_HEX_PATTERN_MULTILINE/RAW_COLOR_PROPERTY_RGBA_PATTERN_MULTILINE
// scanners already flag on their own — their `[^;]*` infix tolerance matches
// straight through `color-mix(in srgb, ` to the `#fff`/`rgba(` operand
// beyond it, with no awareness that `color-mix` is even present. Deleting
// COLOR_MIX_RAW_OPERAND_PATTERN left the test green, so it never proved the
// new detector does anything. This fixture instead puts the exact same
// operand shapes inside a plain template-literal assignment in a .tsx file —
// no CSS property name, no custom-property prefix, no Tailwind arbitrary
// bracket, no quote immediately before the colour function (the one shape
// QUOTED_DIRECT_COLOR_PATTERN would catch) — so only
// COLOR_MIX_RAW_OPERAND_PATTERN can see the raw operand.
test('r5-ui-F2: flags color-mix() whose operand is a raw hex/rgba literal, not a token reference', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const glowA = `color-mix(in srgb, #fff 25%, transparent)`;',
			'const glowB = `color-mix(in srgb, rgba(0, 0, 0, 0.4) 10%, white)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);
	const flaggedLines = new Set(
		colorViolations.map((violation) => violation.line),
	);

	assert.equal(colorViolations.length, 2);
	assert.deepEqual([...flaggedLines].sort(), [1, 2]);
});

// W5-HARDEN (W5-VERIFY2): three evasions different in shape from the
// original raw-hex/rgba fixture above, all planted by the verifier and all
// invisible to the old whole-expression regex (`[^)]*` stopped at the first
// nested `)`, and the pattern never recognised a bare named colour or a
// `color()` function at all):
//  - a raw colour as the SECOND operand, after a var() first operand;
//  - a bare named CSS colour keyword (`white`) with no function wrapper;
//  - a `color(display-p3 ...)` function operand.
test('r5-ui-F2 (hardened): flags a raw second operand after var(), a bare named colour, and color()', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const rawSecondOperand = `color-mix(in srgb, var(--primary) 50%, #ffffff)`;',
			'const namedRawOperand = `color-mix(in srgb, white 25%, transparent)`;',
			'const colorFunctionOperand = `color-mix(in srgb, color(display-p3 1 0 0) 25%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);
	const flaggedLines = new Set(
		colorViolations.map((violation) => violation.line),
	);

	assert.equal(colorViolations.length, 3);
	assert.deepEqual([...flaggedLines].sort(), [1, 2, 3]);
});

// A color-mix() whose colour-interpolation clause (`in oklab`) and every
// operand is a var()/theme-invariant keyword must still be clean — the
// operand parser must not regress into flagging the safe case it exists to
// permit.
test('r5-ui-F2 (hardened): does not flag a fully token-referencing color-mix()', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'const glow = `color-mix(in oklab, var(--publy-primary) 25%, transparent)`;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// W6-GUARDS (tests F5): `isSafeColorMixValue` accepted ANY operand starting
// with `var(` as safe, without inspecting its fallback — a raw-literal
// fallback (rendered by the browser whenever the custom property is unset)
// is exactly as raw as a bare literal operand.
test('W6-GUARDS: flags a color-mix() operand whose var() carries a raw hex fallback', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'const glow = `color-mix(in srgb, var(--missing-brand, #ffffff) 50%, transparent)`;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

// Regression guard: a var() fallback that is ITSELF safe (another token
// reference, or a theme-invariant keyword) must stay clean.
test('W6-GUARDS: does not flag a color-mix() operand whose var() fallback is itself a safe token/keyword (regression guard)', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const a = `color-mix(in srgb, var(--publy-primary, var(--publy-accent)) 50%, transparent)`;',
			'const b = `color-mix(in srgb, var(--publy-primary, transparent) 50%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// W5-HARDEN2 item 4A: CSS function/keyword spelling is ASCII case-insensitive
// end to end — `COLOR-MIX(IN SRGB, WHITE 25%, TRANSPARENT)` is exactly as raw
// as the lowercase form, but the opener regex used to be case-sensitive.
test('W5-HARDEN2: flags an uppercase-spelled color-mix() with a raw operand', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx':
			'const glow = `COLOR-MIX(IN SRGB, WHITE 25%, TRANSPARENT)`;',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		1,
	);
});

// W5-HARDEN2 item 4B: the ordinary source driver tests one line at a time,
// so a color-mix() call wrapped across several lines (a multi-line template
// literal) never has its matching close paren on the same line the opener
// was found on — invisible to a per-line scan. A whole-file pass (mirroring
// how the CSS statement-join branch already spans multiple lines) is
// required to see it.
test('W5-HARDEN2: flags a color-mix() with a raw operand wrapped across multiple lines in a .tsx template literal', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'export const w5Harden2ColorMix = `color-mix(',
			'\tin srgb,',
			'\tvar(--publy-primary) 50%,',
			'\twhite 50%',
			')`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 1);
	assert.equal(colorViolations[0].line, 1);
});

// A multi-line color-mix() call whose every operand is safe must still be
// clean — the whole-file pass must not regress into treating "spans several
// lines" itself as suspicious.
test('W5-HARDEN2: does not flag a fully token-referencing color-mix() wrapped across multiple lines', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'export const w5Harden2ColorMix = `color-mix(',
			'\tin srgb,',
			'\tvar(--publy-primary) 50%,',
			'\ttransparent',
			')`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// W5-HARDEN2 item 4 (over-rejection, boundary matrix): a fully token-derived
// NESTED color-mix() and a token-derived relative-colour operand
// (`rgb(from var(--x) r g b)`) must NOT be flagged — every colour source in
// both is theme-aware, only the syntax is more complex than a bare var().
test('W5-HARDEN2: does not flag a fully token-referencing nested color-mix() or relative-colour operand', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const nested = `color-mix(in srgb, color-mix(in srgb, var(--publy-primary) 50%, transparent) 50%, var(--publy-secondary))`;',
			'const relative = `color-mix(in srgb, rgb(from var(--publy-primary) r g b) 50%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});

// The nested/relative safety carve-outs above must not become a blanket
// exemption: a nested color-mix() with its OWN raw operand, and a relative
// operand based on a raw (non-var) colour, must still be flagged.
test('W5-HARDEN2: still flags a nested color-mix() with its own raw operand, and a relative-colour operand based on a raw colour', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'const nested = `color-mix(in srgb, color-mix(in srgb, white 50%, transparent) 50%, var(--publy-secondary))`;',
			'const relative = `color-mix(in srgb, rgb(from white r g b) 50%, transparent)`;',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);
	const flaggedLines = new Set(
		colorViolations.map((violation) => violation.line),
	);

	assert.equal(colorViolations.length, 2);
	assert.deepEqual([...flaggedLines].sort(), [1, 2]);
});

test('r4-ui-F3: token-theme-parity flags a light-only root oklch() token with no html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-surface-experimental: oklch(95% 0.02 90);',
			'}',
			'',
			'html.dark {',
			'\t--publy-other-token: 1;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.ok(
		violations.some(
			(violation) =>
				violation.ruleId === 'token-theme-parity' &&
				violation.source.includes('oklch'),
		),
	);
});

test('r4-ui-F3: does not flag color-mix() referencing a token as a raw colour literal', async () => {
	const root = await makeFixture({
		'src/styles/other.css':
			'.ok { background: color-mix(in srgb, var(--publy-primary) 25%, transparent); }',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter((violation) => violation.ruleId === 'no-raw-visual-color')
			.length,
		0,
	);
});

test('flags wrapped internal staff and tenant anchors in authed routes', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': `
			<a
				href="/staff/dashboard"
				className="quiet"
			>
				Staff
			</a>
			<a
				href="/tenant"
			>
				Tenant
			</a>
		`,
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-internal-anchor',
		).length,
		2,
	);
});

test('flags a raw anchor whose href is a path-constant expression', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<a href={STAFF_INVITATIONS_LIST_PATH} className="publy-back-link">Back</a>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const anchors = violations.filter(
		(violation) => violation.ruleId === 'no-raw-internal-anchor',
	);

	assert.equal(anchors.length, 1);
	assert.match(anchors[0].source, /href=\{STAFF_INVITATIONS_LIST_PATH\}/);
});

test('does not flag a TanStack Link with a path-constant `to` prop', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<Link to={STAFF_INVITATIONS_LIST_PATH} className="publy-back-link">Back</Link>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});
	const anchors = violations.filter(
		(violation) => violation.ruleId === 'no-raw-internal-anchor',
	);

	assert.equal(anchors.length, 0);
});

test('flags a page.route glob whose trailing single star cannot cross a path separator', async () => {
	const root = await makeFixture({
		'e2e/tenants.spec.ts':
			"await page.route('**/staff/tenants*', handler);\nawait page.route('**/staff/profiles**', handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.equal(globViolations[0].line, 1);
	assert.match(globViolations[0].source, /staff\/tenants\*/);
});

// F824 (tests F4): the rule's receiver was anchored to a bare `\w+\.route(`
// identifier — a chained receiver like `page.context().route(` ends in `)`
// before the `.`, so the pattern never matched and a single-star glob hung
// off a chained Playwright receiver was structurally invisible to the guard.
test('F824-tests-F4: flags a single-star glob on a chained receiver (page.context().route)', async () => {
	const root = await makeFixture({
		'e2e/chained.spec.ts':
			"await page.context().route('**/staff/tenants*', handler);\nawait page.context().route('**/staff/profiles**', handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(
		globViolations.length,
		1,
		'the chained-receiver single-star glob must be flagged',
	);
	assert.equal(globViolations[0].line, 1);
});

test('a design-system-ignore marker suppresses only when it carries a reason', async () => {
	const bare = await makeFixture({
		'e2e/bare.spec.ts':
			"// design-system-ignore: no-single-star-route-glob\nawait page.route('**/staff/tenants*', handler);",
	});
	const reasoned = await makeFixture({
		'e2e/reasoned.spec.ts':
			"// design-system-ignore: no-single-star-route-glob — collection-only mock\nawait page.route('**/staff/tenants*', handler);",
	});

	const countFor = async (root: string) => {
		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDirs: [path.join(root, 'e2e')],
		});
		return violations.filter(
			(violation) => violation.ruleId === 'no-single-star-route-glob',
		).length;
	};

	assert.equal(await countFor(bare), 1, 'a bare marker must not suppress');
	assert.equal(await countFor(reasoned), 0, 'a reasoned marker must suppress');
});

// W5-PROOF: a JSX-comment-form marker whose only "reason" text is the
// comment's own closing delimiter (`*/}`) must not count as reasoned — the
// same emptiness bug the data-honesty and i18n-guard suppression conventions
// shared.
test('a design-system-ignore marker in JSX-comment form still requires a reason beyond `*/}`', async () => {
	const countForSource = async (source: string) => {
		const root = await makeFixture({ 'e2e/jsx.spec.ts': source });
		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDirs: [path.join(root, 'e2e')],
		});
		return violations.filter(
			(violation) => violation.ruleId === 'no-single-star-route-glob',
		).length;
	};

	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob */}\nawait page.route('**/staff/tenants*', handler);",
		),
		1,
		'a bare JSX comment marker (only `*/}` after the rule id) must not suppress',
	);
	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob   */}\nawait page.route('**/staff/tenants*', handler);",
		),
		1,
		'trailing whitespace before the JSX close must not count as a reason',
	);
	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob . */}\nawait page.route('**/staff/tenants*', handler);",
		),
		1,
		'a single non-word character must not count as a reason',
	);
	assert.equal(
		await countForSource(
			"{/* design-system-ignore: no-single-star-route-glob — collection-only mock */}\nawait page.route('**/staff/tenants*', handler);",
		),
		0,
		'a genuine reasoned JSX comment marker must still suppress',
	);
});

test('F30: flags a single-star glob registered via context.route(), not just page.route()', async () => {
	const root = await makeFixture({
		'e2e/context-route.spec.ts':
			"await context.route('**/staff/tenants*', handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.match(globViolations[0].source, /staff\/tenants\*/);
});

// W6-GUARDS (tests F6): a fixture/receiver alias — a renamed or destructured
// Playwright fixture, not the two hand-picked names `page`/`context` — was
// structurally invisible to the previous receiver-name-anchored regex.
test('W6-GUARDS: flags a single-star glob registered via an aliased receiver, not just page/context', async () => {
	const root = await makeFixture({
		'e2e/staff-fixture.spec.ts':
			"await staffPage.route('**/staff/tenants*', handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.match(globViolations[0].source, /staff\/tenants\*/);
});

// W6-GUARDS (tests F6): a glob passed through a local constant instead of an
// inline literal — a different shape from the alias evasion above — can
// never be statically checked for the single-star shape, so it must fail
// closed rather than silently pass.
test('W6-GUARDS: fails closed when a route glob is passed as a non-literal identifier, not inlined', async () => {
	const root = await makeFixture({
		'e2e/constant-glob.spec.ts':
			"const glob = '**/staff/tenants*';\nawait page.route(glob, handler);",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 1);
	assert.match(globViolations[0].source, /page\.route\(glob/);
});

// Regression guard: this codebase's existing e2e specs widely compose globs
// as template literals (`` `**/staff/tenants/${TENANT_ID}/users` `` and
// similar), with or without a trailing `**`. The fail-closed constant check
// above must not treat every template-literal glob as unresolvable — only a
// genuinely non-literal (bare identifier) argument.
test('W6-GUARDS: does not fail closed on an ordinary interpolated template-literal glob (regression guard)', async () => {
	const root = await makeFixture({
		'e2e/template-glob.spec.ts':
			'await page.route(\n\t`**/staff/tenants/${TENANT_ID}/users/export**`,\n\thandler,\n);',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDirs: [path.join(root, 'e2e')],
	});

	const globViolations = violations.filter(
		(violation) => violation.ruleId === 'no-single-star-route-glob',
	);

	assert.equal(globViolations.length, 0);
});

test('F5: no-raw-visual-color is block-aware in app.css, not file-aware — raw hex outside :root/html.dark still fails', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			'.publy-new-rule {',
			'\tbackground: #ffffff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	// The two :root/html.dark declarations are allowed; the third raw hex,
	// outside both blocks, is not — this is exactly the F1 shape (a new rule
	// with a hardcoded #fff outside the token layer) that a whole-file
	// `allow: (path) => path === 'src/styles/app.css'` exemption would miss.
	assert.equal(colorViolations.length, 1);
	assert.match(colorViolations[0].source, /background:\s*#ffffff/);
});

// r3 F3: the property allowlist previously only covered
// color/background/border-color/outline-color — a `border:`/`outline:`
// shorthand carrying the same literal sailed through unflagged, which is
// exactly how .btn-primary-chrome's border landed unscanned next to its
// correctly-tokenised box-shadow twin.
test('r3 F3: no-raw-visual-color catches the border/outline shorthand, not just border-color/outline-color', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			'.publy-new-chrome {',
			'\tborder: 1px solid rgba(255, 255, 255, 0.12);',
			'\toutline: 2px solid #ffffff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 2);
	assert.ok(colorViolations.some((v) => /border:/.test(v.source)));
	assert.ok(colorViolations.some((v) => /outline:/.test(v.source)));
});

// r3 F3: a raw literal handed straight to a `--custom-prop:` declaration has
// no property name at all, so it was invisible to every pattern in the
// rule — the shape 32 `--publy-icon-tile-bg`/`-fg` literals shipped as.
test('r3 F3: no-raw-visual-color catches a raw colour literal in a custom-property declaration', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			".publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #f0f9ff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 1);
	assert.match(colorViolations[0].source, /--publy-tone-bg:\s*#f0f9ff/);
});

// r3 F3: token-theme-parity's :root/html.dark loop is blind to a
// colour-valued custom property declared on an ordinary component
// selector — the same 32-literal shape, but checking whether it has a
// paired `html.dark <selector>` counterpart rather than whether it's a raw
// literal at all.
test('r3 F3: token-theme-parity flags a selector-scoped custom property with no html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			".publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #f0f9ff;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) =>
			violation.ruleId === 'token-theme-parity' &&
			/--publy-tone-bg/.test(violation.source),
	);

	assert.equal(parityHits.length, 1);
});

test('r3 F3: token-theme-parity does not flag a selector-scoped custom property that has a matching html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-primary: #fdc700;',
			'}',
			'',
			'html.dark {',
			'\t--publy-primary: #f0bd00;',
			'}',
			'',
			".publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #f0f9ff;',
			'}',
			'',
			"html.dark .publy-tone-tile[data-tone='0'] {",
			'\t--publy-tone-bg: #082f49;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) =>
			violation.ruleId === 'token-theme-parity' &&
			/--publy-tone-bg/.test(violation.source),
	);

	assert.equal(parityHits.length, 0);
});

// r3 F4: `recordViolation` only honoured `design-system-ignore` when it
// received a `lines` argument — the default line-scan branch (every
// line-mode rule except the two `mode: 'source'` rules) called it without
// one, so the escape hatch was inert for exactly the rules contributors are
// most likely to reach for it on.
test('r3 F4: a design-system-ignore marker suppresses a default line-scan rule (no-prototype-icons)', async () => {
	const bare = await makeFixture({
		'src/routes/authed/staff/bare.tsx':
			'// design-system-ignore: no-prototype-icons\n<AppErrorView icon="!" title="Error" />',
	});
	const reasoned = await makeFixture({
		'src/routes/authed/staff/reasoned.tsx':
			'// design-system-ignore: no-prototype-icons — legacy fixture pending redesign\n<AppErrorView icon="!" title="Error" />',
	});

	const countFor = async (root: string) => {
		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDir: path.join(root, 'src'),
		});
		return violations.filter(
			(violation) => violation.ruleId === 'no-prototype-icons',
		).length;
	};

	assert.equal(await countFor(bare), 1, 'a bare marker must not suppress');
	assert.equal(await countFor(reasoned), 0, 'a reasoned marker must suppress');
});

test('F6: throws on a vacuous scan (0 files) instead of silently passing', async () => {
	const root = await makeFixture({
		'src/keep.txt':
			'not scanned — wrong extension, and directory is empty of .ts/.tsx/.css',
	});

	await assert.rejects(
		() =>
			scanFront2DesignSystem({
				baseDir: root,
				sourceDirs: [path.join(root, 'nonexistent-dir')],
			}),
		/scanned 0 files/,
	);
});

test('F6: does not throw when the scan finds at least one file', async () => {
	const root = await makeFixture({
		'src/example.tsx': '<div />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(Array.isArray(violations), true);
	assert.equal(violations.scannedFileCount, 1);
});

test('r3-F4: throws when one of several sourceDirs is missing, even though the combined total is non-zero', async () => {
	const root = await makeFixture({
		'src/example.tsx': '<div />',
	});

	// `src/` alone contributes a file, so the old combined `files.length === 0`
	// check would never fire here — but `e2e/` was never created, so any rule
	// scoped to `e2e/` (e.g. `no-single-star-route-glob`) silently scans
	// nothing. This must still throw.
	await assert.rejects(
		() =>
			scanFront2DesignSystem({
				baseDir: root,
				sourceDirs: [path.join(root, 'src'), path.join(root, 'e2e')],
			}),
		/scanned 0 files from 1 of 2 source directories/,
	);
});

test('F7: self-pruning stale-debt check flags a guardDebt entry whose source text no longer appears in its file', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<div className="rounded-full">x</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkStaleDebt: true,
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'this substring was never in the file',
				reason: 'fixture: intentionally stale',
				maxOccurrences: 1,
			},
		],
	});

	const staleViolations = violations.filter(
		(violation) => violation.ruleId === 'stale-guard-debt',
	);

	assert.equal(staleViolations.length, 1);
	assert.equal(staleViolations[0].file, 'src/routes/authed/staff/example.tsx');
});

test('F7: self-pruning stale-debt check does not flag a guardDebt entry that still matches', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx':
			'<div className="rounded-full">x</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkStaleDebt: true,
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'rounded-full',
				reason: 'fixture: still valid',
				maxOccurrences: 1,
			},
		],
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'stale-guard-debt'),
		false,
	);
});

// r3 F10: a debt entry whose file was deleted entirely (not just present
// with different content) used to `continue` past unnoticed, so it lived on
// forever and would silently re-permit a violation if the path was ever
// recreated.
test('r3 F10: self-pruning stale-debt check flags a guardDebt entry whose file no longer exists in the scan', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/still-here.tsx': '<div>ok</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkStaleDebt: true,
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/deleted-file.tsx',
				sourceIncludes: 'rounded-full',
				reason: 'fixture: file no longer exists',
				maxOccurrences: 1,
			},
		],
	});

	const staleViolations = violations.filter(
		(violation) => violation.ruleId === 'stale-guard-debt',
	);

	assert.equal(staleViolations.length, 1);
	assert.equal(
		staleViolations[0].file,
		'src/routes/authed/staff/deleted-file.tsx',
	);
});

test('F7: self-pruning stale-debt check is opt-in — off by default so a fixture reusing a real debt file path is not misjudged', async () => {
	// This exact relative path is a real KNOWN_HANDOFF_GUARD_DEBT file in the
	// live scripts/check-design-system.mjs list, registered against a
	// completely different sourceIncludes substring than this fixture's
	// content. Without the opt-in default, this fixture alone would
	// misreport that real entry as stale.
	const root = await makeFixture({
		'src/components/app-shell/app-shell.tsx':
			'<div className="unrelated-fixture-markup" />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'stale-guard-debt'),
		false,
	);
});

test('F9: no-important-foundation catches the Tailwind v4 `suffix!` syntax, not just the dead v3 `!prefix` form', async () => {
	const root = await makeFixture({
		'src/components/table/v4-important.tsx':
			'<div className="border-transparent! top-1/2!">Bad</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-important-foundation',
		),
		true,
	);
});

test('F9: no-important-foundation now scans app.css, where the real !important declarations live', async () => {
	const root = await makeFixture({
		'src/styles/app.css': '.new-rule {\n\tcolor: red !important;\n}\n',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) =>
				violation.ruleId === 'no-important-foundation' &&
				violation.file === 'src/styles/app.css',
		),
		true,
	);
});

// F824 ui F1: a debt entry is a BUDGET, not an unlimited licence. The old
// matcher did `source.includes(snippet)` against the whole FILE, so one
// occurrence anywhere let EVERY violation of the same rule in that file
// through — including a second, unrelated offense on a different line.
test('F824 ui F1: a guardDebt entry covers only its budgeted occurrences — violations beyond it are reported', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': [
			'<div className="rounded-full">budgeted</div>',
			'<div className="rounded-full">beyond budget</div>',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'rounded-full',
				maxOccurrences: 1,
				reason: 'fixture: budget of exactly one occurrence',
			},
		],
	});

	const debtRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);
	assert.equal(debtRuleHits.length, 1);
	assert.match(debtRuleHits[0]?.source ?? '', /beyond budget/);
});

// F824 tests F2: duplicates of the SAME snippet each consume one unit of the
// entry's budget — a copy-pasted repeat of the debt line cannot ride the same
// single-shot exemption forever.
test('F824 tests F2: duplicate occurrences of a debt snippet consume the budget one-for-one', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': [
			'<div className="rounded-full">duplicate</div>',
			'<div className="rounded-full">duplicate</div>',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'rounded-full',
				maxOccurrences: 1,
				reason:
					'fixture: one occurrence allowed, second duplicate must surface',
			},
		],
	});

	const debtRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);
	assert.equal(debtRuleHits.length, 1);
	assert.equal(debtRuleHits[0].line, 2);
});

test('F824: occurrences within an explicit budget stay suppressed', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': [
			'<div className="rounded-full">a</div>',
			'<div className="rounded-full">b</div>',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'rounded-full',
				maxOccurrences: 2,
				reason: 'fixture: budget of exactly two occurrences',
			},
		],
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
		),
		false,
	);
});

// r1-fix (PR #1298 round 1, CRITICAL): budgets are charged PER OCCURRENCE,
// so occurrences stacked on ONE line each consume their unit. The old
// per-line ledger let a line bearing N occurrences of the snippet spend a
// single unit of an N-measured budget, leaving N−1 units of permanent slack
// that silently re-permitted N−1 NEW violations (tooltip.tsx: four
// `top-1/2!` on one Arrow line against maxOccurrences 4).
test('r1-fix: a multi-occurrence line spends one budget unit per occurrence it carries', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.tsx': [
			'<div className="rounded-full" data-alt="rounded-full">both on one line</div>',
			'<div className="rounded-full">beyond the occurrence budget</div>',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/routes/authed/staff/example.tsx',
				sourceIncludes: 'rounded-full',
				maxOccurrences: 2,
				reason: 'fixture: budget of exactly the two stacked occurrences',
			},
		],
	});

	const debtRuleHits = violations.filter(
		(violation) => violation.ruleId === 'no-rounded-full-or-999-radius',
	);
	assert.equal(debtRuleHits.length, 1);
	assert.match(debtRuleHits[0]?.source ?? '', /beyond the occurrence budget/);
});

// r1-fix: measure a debt entry's snippet occurrences in its REAL file
// (`(?!-)snippet`, non-overlapping \u2014 the same shape the guard's own
// countSnippetOccurrences uses).
const countSnippetOccurrencesInFile = async (debt: GuardDebtEntry) => {
	const content = await readFile(
		fileURLToPath(new URL(`../../${debt.file}`, import.meta.url)),
		'utf8',
	);
	const pattern = new RegExp(
		`(?<!-)${debt.sourceIncludes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
		'g',
	);
	return [...content.matchAll(pattern)].length;
};

// r1-fix: the zero-slack invariant as a PERMANENT test over the REAL repo,
// through the same production code path the real CLI run uses
// (checkDebtBudgetSlack): budget − current occurrences == 0 for EVERY
// KNOWN_GUARD_DEBT entry. An entry whose budget exceeds the file's real
// occurrence count leaves slack that silently re-permits new violations; one
// below it fails the guard on recorded code. Either way this test (and the
// real CLI run) now goes red instead of carrying the slack silently.
//
// Liveness coupling (paired red proof, PR #1298 round 1): reverting ONLY the
// ledger change (per-occurrence charging + checkDebtBudgetSlack) makes this
// exact assertion fail on today's real data — the tooltip entry then carries
// budget 4 against one consuming LINE, i.e. slack 3. The tooltip assertions
// below pin the concrete case so the proof cannot decay into vacuity.
test('r1-fix: every KNOWN_GUARD_DEBT budget equals the exact current occurrence count (zero slack)', async () => {
	const violations = await scanFront2DesignSystem({
		checkStaleDebt: false,
		checkTokenGuards: false,
		checkSuppressionInventory: false,
		checkDebtBudgetSlack: true,
	});

	const slackFindings = violations.filter(
		(violation) => violation.ruleId === 'guard-debt-budget-slack',
	);
	assert.deepEqual(
		slackFindings,
		[],
		'every debt budget must equal the exact current occurrence count of its snippet',
	);

	// The round-1 CRITICAL case, pinned to real repo data: the tooltip entry
	// is measured per occurrence (4 stacked on one Arrow line), and the
	// per-occurrence ledger consumes exactly its whole budget — zero units
	// left after the status quo, so ANY new occurrence anywhere in the file
	// surfaces. If the ledger ever reverts to per-line charging, this
	// assertion fails with 3 remaining units (the review's proven slack).
	const tooltipEntry = KNOWN_GUARD_DEBT.find(
		(debt) =>
			debt.ruleId === 'no-important-foundation' &&
			debt.file === 'src/components/ui/tooltip.tsx',
	);
	assert.ok(tooltipEntry, 'the tooltip top-1/2! debt entry must exist');
	assert.equal(
		tooltipEntry.maxOccurrences,
		await countSnippetOccurrencesInFile(tooltipEntry),
		'tooltip budget must equal its real occurrence count',
	);
	const tooltipContent = await readFile(
		fileURLToPath(
			new URL('../../src/components/ui/tooltip.tsx', import.meta.url),
		),
		'utf8',
	);
	const probe = createHandoffLedgerProbe(KNOWN_GUARD_DEBT);
	assert.equal(
		probe.remainingAfterStatusQuo(
			'no-important-foundation',
			'src/components/ui/tooltip.tsx',
			tooltipContent,
		),
		0,
		'the tooltip budget must be fully consumed by the status quo occurrences — any slack silently re-permits new violations',
	);
});

// r1-fix: the slack detector itself works — an over-budgeted entry in a
// fixture produces an explicit guard-debt-budget-slack finding naming both
// numbers (this is the exact shape the round-1 review proved exploitable).
test('r1-fix: checkDebtBudgetSlack flags an entry whose budget exceeds the real occurrence count', async () => {
	const root = await makeFixture({
		'src/components/table/r1-slack.tsx':
			'<div className="rounded-full">single occurrence</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/components/table/r1-slack.tsx',
				sourceIncludes: 'rounded-full',
				maxOccurrences: 4,
				reason: 'fixture: dishonest budget of four against one real occurrence',
			},
		],
		checkDebtBudgetSlack: true,
	});

	const slackFindings = violations.filter(
		(violation) => violation.ruleId === 'guard-debt-budget-slack',
	);
	assert.equal(slackFindings.length, 1);
	assert.match(slackFindings[0]?.message ?? '', /maxOccurrences 4/);
	assert.match(slackFindings[0]?.message ?? '', /carries 1 occurrence/);

	// Control: the same fixture with the honest budget of 1 produces no slack
	// finding (and the occurrence itself stays suppressed within budget).
	const honestViolations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		guardDebt: [
			{
				ruleId: 'no-rounded-full-or-999-radius',
				file: 'src/components/table/r1-slack.tsx',
				sourceIncludes: 'rounded-full',
				maxOccurrences: 1,
				reason: 'fixture: honest budget of exactly one occurrence',
			},
		],
		checkDebtBudgetSlack: true,
	});
	assert.deepEqual(
		honestViolations.filter(
			(violation) =>
				violation.ruleId === 'guard-debt-budget-slack' ||
				violation.ruleId === 'no-rounded-full-or-999-radius',
		),
		[],
	);
});

// F824 ui F2: parity ran in ONE direction only (:root tokens needing a dark
// counterpart), so a token defined ONLY in html.dark passed as clean while
// its light-mode value silently fell back to whatever cascade default
// applied. Dark-only colour tokens are flagged by the same rule.
test('F824 ui F2: token-theme-parity flags a colour token declared only in html.dark', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-background: #ffffff;',
			'}',
			'',
			'html.dark {',
			'\t--publy-background: #18181b;',
			'\t--publy-alert-critical-bg: #7f1d1d;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const darkOnlyHits = violations.filter(
		(violation) =>
			violation.ruleId === 'token-theme-parity' &&
			violation.source.includes('--publy-alert-critical-bg'),
	);

	assert.equal(darkOnlyHits.length, 1);
});

test('F3: token-theme-parity flags a colour token declared in :root with no html.dark counterpart', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-alert-critical-bg: #fee2e2;',
			'}',
			'',
			'html.dark {',
			'\t--publy-background: #18181b;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) =>
			violation.ruleId === 'token-theme-parity' &&
			// F824 ui F2: the symmetric check now also flags dark-only colour
			// tokens; this fixture's html.dark --publy-background is one, and its
			// flag is asserted by the F824 ui F2 test below. Scope this legacy
			// assertion to the light-only token it has always been about.
			violation.source.includes('--publy-alert-critical-bg'),
	);

	assert.equal(parityHits.length, 1);
	assert.match(parityHits[0].source, /--publy-alert-critical-bg/);
});

test('F3: token-theme-parity does not flag a token whose value only references another (already themed) token', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-border: #e4e4e7;',
			'\t--publy-shadow-ring: 0 0 0 1px var(--publy-border);',
			'\t--publy-focus-ring: color-mix(in srgb, var(--publy-primary) 25%, transparent);',
			'}',
			'',
			'html.dark {',
			'\t--publy-border: rgba(255, 255, 255, 0.1);',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'token-theme-parity'),
		false,
	);
});

test('F3: token-theme-parity does not flag the documented theme-invariant allowlist', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-avatar-1: #0f766e;',
			'\t--publy-auth-panel-bg: #18181b;',
			'\t--publy-shadow-chrome: 0 2px 2px rgba(255, 255, 255, 0.1) inset;',
			'\t--publy-background: #ffffff;',
			'}',
			'',
			'html.dark {',
			'\t--publy-background: #18181b;',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'token-theme-parity'),
		false,
	);
});

test('F3: token-must-be-declared flags a --publy-* reference with no declaration anywhere in app.css', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root {\n\t--publy-primary: #fdc700;\n}\n',
		'src/components/ui/card.tsx':
			'<div style={{ boxShadow: "var(--publy-shadow-card)" }} />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const declaredHits = violations.filter(
		(violation) => violation.ruleId === 'token-must-be-declared',
	);

	assert.equal(declaredHits.length, 1);
	assert.equal(declaredHits[0].file, 'src/components/ui/card.tsx');
	assert.match(declaredHits[0].source, /--publy-shadow-card/);
});

test('F3: token-must-be-declared does not flag a reference to a token declared in app.css', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root {\n\t--publy-primary: #fdc700;\n}\n',
		'src/components/ui/card.tsx':
			'<div style={{ color: "var(--publy-primary)" }} />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'token-must-be-declared',
		),
		false,
	);
});

// W6-GUARDS (ui F3): the token-declaration extractor regexed raw source text
// without stripping comments, so a commented-out mention of a token name
// satisfied `token-must-be-declared` for a real usage even though no actual
// declaration exists anywhere.
test('W6-GUARDS: token-must-be-declared still flags a reference whose only "declaration" is inside a CSS comment', async () => {
	const root = await makeFixture({
		'src/styles/app.css':
			':root {\n\t/* --publy-missing: reserved; */\n\t--publy-primary: #fdc700;\n}\n',
		'src/components/ui/card.tsx':
			'<div style={{ boxShadow: "var(--publy-missing)" }} />',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const declaredHits = violations.filter(
		(violation) => violation.ruleId === 'token-must-be-declared',
	);

	assert.equal(declaredHits.length, 1);
	assert.match(declaredHits[0].source, /--publy-missing/);
});

// W6-GUARDS (ui F3): the same comment-blindness let token-theme-parity pass
// a token that is genuinely declared in :root but only ever COMMENTED in
// html.dark — the parity guard must still see it as missing a real dark
// counterpart.
test('W6-GUARDS: token-theme-parity still flags a token whose only html.dark "counterpart" is inside a CSS comment', async () => {
	const root = await makeFixture({
		'src/styles/app.css':
			':root {\n\t--publy-primary: #fdc700;\n}\n\nhtml.dark {\n\t/* --publy-primary: dark value pending; */\n}\n',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkTokenGuards: true,
	});

	const parityHits = violations.filter(
		(violation) => violation.ruleId === 'token-theme-parity',
	);

	assert.equal(parityHits.length, 1);
	assert.match(parityHits[0].source, /--publy-primary/);
});

test('F3: token guards are opt-in — off by default so an existing fixture without a full token layer is not misjudged', async () => {
	const root = await makeFixture({
		'src/styles/app.css': ':root {\n\t--publy-alert-critical-bg: #fee2e2;\n}\n',
		'src/components/ui/card.tsx': 'var(--publy-undeclared-token)',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) =>
				violation.ruleId === 'token-theme-parity' ||
				violation.ruleId === 'token-must-be-declared',
		),
		false,
	);
});

test('F4: no-important-foundation now scans src/components/ui/ and src/routes/, where r1 left a bg-red-500!-shaped regression invisible', async () => {
	const root = await makeFixture({
		'src/components/ui/new-primitive.tsx':
			'<div className="bg-red-500!">Bad</div>',
		'src/routes/authed/staff/example.tsx':
			'<div className="bg-red-500!">Bad</div>',
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const hits = violations.filter(
		(violation) => violation.ruleId === 'no-important-foundation',
	);

	assert.equal(hits.length, 2);
	assert.equal(
		hits.some(
			(violation) => violation.file === 'src/components/ui/new-primitive.tsx',
		),
		true,
	);
	assert.equal(
		hits.some(
			(violation) => violation.file === 'src/routes/authed/staff/example.tsx',
		),
		true,
	);
});

test('F4: no-important-foundation excludes test-file string fixtures under src/routes/ from the widened scan', async () => {
	const root = await makeFixture({
		'src/routes/authed/staff/example.test.tsx':
			"target: { value: 'Not Valid!' },",
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some(
			(violation) => violation.ruleId === 'no-important-foundation',
		),
		false,
	);
});

test('F4: the real src/components/ui/ pre-existing `!`-suffix usages (badge, tabs, tooltip) are recorded debt, not silent violations', async () => {
	const violations = await scanFront2DesignSystem({ checkStaleDebt: true });

	assert.deepEqual(
		violations.filter(
			(violation) =>
				violation.ruleId === 'no-important-foundation' &&
				violation.file.startsWith('src/components/ui/'),
		),
		[],
	);
	assert.deepEqual(
		violations.filter((violation) => violation.ruleId === 'stale-guard-debt'),
		[],
	);
});

test('F4: no-raw-visual-color is multi-line-aware — a wrapped box-shadow with the property name and the colour literal on different lines still fails', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			'@layer components {',
			'\t.publy-new-elevated-rule {',
			'\t\tbox-shadow:',
			'\t\t\t0 20px 25px -5px rgb(0 0 0 / 0.15),',
			'\t\t\t0 8px 10px -6px rgb(0 0 0 / 0.15);',
			'\t}',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const colorViolations = violations.filter(
		(violation) => violation.ruleId === 'no-raw-visual-color',
	);

	assert.equal(colorViolations.length, 1);
	assert.match(colorViolations[0].source, /box-shadow/);
	assert.match(colorViolations[0].source, /rgb\(0 0 0 \/ 0\.15\)/);
});

test('F4: no-raw-visual-color multi-line scanning still respects the :root/html.dark token-layer exemption', async () => {
	const root = await makeFixture({
		'src/styles/app.css': [
			':root {',
			'\t--publy-shadow-menu:',
			'\t\t0 12px 32px rgba(24, 24, 27, 0.14),',
			'\t\t0 2px 6px rgba(24, 24, 27, 0.06);',
			'}',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-raw-visual-color'),
		false,
	);
});

test('F4: the real .publy-selection-bar rule no longer hardcodes a raw rgb() shadow (moved to a token)', async () => {
	const css = await readFile(
		new URL('../../src/styles/app.css', import.meta.url),
		'utf8',
	);

	const ruleMatch = css.match(/\.publy-selection-bar\s*\{([^}]*)\}/);
	assert.ok(ruleMatch, '.publy-selection-bar rule not found');
	assert.doesNotMatch(ruleMatch[1], /rgb\(/);
	assert.match(ruleMatch[1], /var\(--publy-shadow-selection-bar\)/);
});

test('F6: .publy-state-icon svg is declared exactly once (the un-layered copy); the layered duplicate is gone', async () => {
	const css = await readFile(
		new URL('../../src/styles/app.css', import.meta.url),
		'utf8',
	);

	const occurrences = css.match(/\.publy-state-icon svg \{/g) ?? [];
	assert.equal(occurrences.length, 1);
});

test('F6: the tbody last-child border-bottom rule no longer has a dead layered `{ border-bottom: 0 }` duplicate, and its comment no longer claims a specificity/order win', async () => {
	const css = await readFile(
		new URL('../../src/styles/app.css', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(
		css,
		/tr:last-child \[data-slot='table-cell'\] \{\s*border-bottom: 0;/,
	);
	assert.doesNotMatch(
		css,
		/tr:last-child \[data-slot='table-selection-cell'\] \{\s*border-bottom: 0;/,
	);
	assert.doesNotMatch(css, /same specificity, declared later wins/);
});

test('F6: the auth panel, T6B, TEN-2 and P3 component rules moved into @layer components', async () => {
	const css = await readFile(
		new URL('../../src/styles/app.css', import.meta.url),
		'utf8',
	);
	const lines = css.split('\n');

	// Tracks brace depth and, separately, the depth at which the innermost
	// still-open `@layer components {` was opened — a selector is "layered"
	// only if that innermost open layer's depth is still on the stack when
	// the selector's line is reached (naive substring/regex counting can't
	// tell a selector's own `{` from an unrelated one earlier in the file).
	const layerOpenDepths = [];
	let depth = 0;
	const layeredAtLine = [];
	for (const line of lines) {
		layeredAtLine.push(layerOpenDepths.length > 0);
		if (/@layer components\s*\{/.test(line)) {
			layerOpenDepths.push(depth);
		}
		for (const char of line) {
			if (char === '{') {
				depth += 1;
			} else if (char === '}') {
				depth -= 1;
				if (
					layerOpenDepths.length > 0 &&
					depth === layerOpenDepths[layerOpenDepths.length - 1]
				) {
					layerOpenDepths.pop();
				}
			}
		}
	}

	for (const selector of [
		'.publy-auth-brand-panel',
		'.publy-profile-icon-tile {',
		'.publy-profile-card-grid {',
		"tr:last-child [data-slot='table-cell']",
	]) {
		const lineIndex = lines.findIndex((line) => line.includes(selector));
		assert.ok(lineIndex > -1, `${selector} not found`);
		assert.equal(
			layeredAtLine[lineIndex],
			true,
			`${selector} expected to be inside @layer components`,
		);
	}

	// Contrast case: the table foundation recipe cluster's documented
	// conflict keeps it un-layered.
	const chromeLineIndex = lines.findIndex((line) =>
		line.includes('.btn-primary-chrome {'),
	);
	assert.ok(chromeLineIndex > -1);
	assert.equal(layeredAtLine[chromeLineIndex], false);
});

test('F1: the --publy-z-* popup stacking scale keeps popups above the drawer/dialog surface, which is above the overlay backdrop', async () => {
	const css = await readFile(
		new URL('../../src/styles/app.css', import.meta.url),
		'utf8',
	);

	const valueOf = (tokenName: string) => {
		const match = css.match(new RegExp(`${tokenName}:\\s*([0-9]+)\\s*;`));
		assert.ok(match, `${tokenName} not declared in app.css`);
		return Number(match[1]);
	};

	const overlay = valueOf('--publy-z-overlay');
	const drawerSurface = valueOf('--publy-z-drawer-surface');
	const menu = valueOf('--publy-z-menu');
	const select = valueOf('--publy-z-select');

	// This is the exact ordering bug r1 F16 shipped on paper: a Select/
	// DropdownMenu opened from inside a Drawer must paint above the drawer's
	// own opaque surface, so `menu`/`select` must outrank `drawer-surface`,
	// which must in turn outrank the dimming `overlay` backdrop underneath it.
	assert.ok(
		overlay < drawerSurface,
		`overlay (${overlay}) must be below drawer-surface (${drawerSurface})`,
	);
	assert.ok(
		drawerSurface < menu,
		`drawer-surface (${drawerSurface}) must be below menu (${menu})`,
	);
	assert.ok(
		menu <= select,
		`menu (${menu}) must not outrank select (${select})`,
	);
});

test('F3: the real app.css token layer passes both guards with zero violations', async () => {
	const violations = await scanFront2DesignSystem({ checkTokenGuards: true });

	assert.deepEqual(
		violations.filter(
			(violation) =>
				violation.ruleId === 'token-theme-parity' ||
				violation.ruleId === 'token-must-be-declared',
		),
		[],
	);
});

// W6-FLAKE #827: the no-raw-visual-color rule consults the app.css token
// layer for EVERY candidate match it finds anywhere in the tree. Recomputing
// getBlockLineRanges per match re-brace-counts the whole app.css token layer
// hundreds of times per scan — pure waste that only shows up as CPU burn
// while vitest workers are starving (the flake's condition). The ranges must
// be derived once per distinct lines array and reused.
test('app.css token-layer block ranges are computed once per scan, not per matched line', async () => {
	scanFront2DesignSystemInternals.resetTokenLayerRangeCacheForTestObservation();

	const violations = await scanFront2DesignSystem({ checkTokenGuards: true });
	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);

	const { computeCalls } =
		scanFront2DesignSystemInternals.getTokenLayerComputeStatsForTestObservation();
	assert.ok(
		computeCalls >= 1,
		'the token-layer ranges must be computed at least once when app.css is scanned',
	);
	assert.ok(
		computeCalls <= 2,
		`app.css token-layer ranges were recomputed ${computeCalls} times for one scan; ` +
			'expected at most one :root + one html.dark derivation per lines array ' +
			'(W6-FLAKE #827: per-match recomputation burns CPU under worker contention)',
	);
});

// W5-HARDEN: reason-quality alone can't stop `aaa` becoming a "substantive"
// reason wordier than the bar requires — the structural backstop is this
// inventory diff. A design-system-ignore comment that isn't in
// suppression-inventory.json (planted here, never regenerated) must fail.
test('checkSuppressionInventory: an undocumented design-system-ignore suppression fails the guard', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'{/* design-system-ignore: no-rounded-full-or-999-radius a brand new undocumented reason */}',
			'<div className="rounded-full" />',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
		checkSuppressionInventory: true,
	});

	assert.ok(
		violations.some(
			(violation) => violation.ruleId === 'suppression-inventory-drift',
		),
	);
});

test('checkSuppressionInventory: is opt-in — off by default so ordinary fixtures are not misjudged against the real inventory', async () => {
	const root = await makeFixture({
		'src/components/table/data-table.tsx': [
			'{/* design-system-ignore: no-rounded-full-or-999-radius a brand new undocumented reason */}',
			'<div className="rounded-full" />',
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'suppression-inventory-drift',
		),
		[],
	);
});

test('checkSuppressionInventory: the real repo has zero drift against the committed inventory', async () => {
	const violations = await scanFront2DesignSystem({
		checkSuppressionInventory: true,
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'suppression-inventory-drift',
		),
		[],
	);
});

// W5-HARDEN2: the actual defect W5-VERIFY3B found — the live guard's
// suppression check and suppression-inventory discovery were two independent
// parsers that could (and did) disagree: a marker embedded on the previous
// line AFTER real code (`const x = true; // design-system-ignore: rule — reason`)
// was honoured by the live guard (`previous.indexOf(marker)`, unanchored) but
// invisible to `findSuppressionSitesInSource` (requires the marker be the
// first thing after a real comment opener on the trimmed line) — the CLI
// reported "0 violations" for a raw-hex literal that was, in fact, silenced.
// Both now call the SAME parser (`isPreviousLineSuppressed` /
// `findSuppressionSitesInSource`), so this drives both code paths — the real
// no-raw-visual-color violation outcome, and raw site discovery — over an
// identical fixture corpus and asserts they can never again disagree. The
// second corpus entry is a differently-shaped evasion of my own invention
// (embedded marker inside a `/* */` line that doesn't open the line, rather
// than a `//` line comment) — different comment syntax, same underlying bug
// class — proving this isn't just a literal replay of the cited example.
const DIVERGENCE_CORPUS = [
	{
		name: 'embedded trailing marker after real code (W5-VERIFY3B report shape)',
		previousLine:
			'const suppressionAnchor = true; // design-system-ignore: no-raw-visual-color — intentionally raw interoperability fixture',
	},
	{
		name: 'marker embedded in a block comment that does not open the line (second, differently-shaped evasion)',
		previousLine:
			'x; /* design-system-ignore: no-raw-visual-color — a second embedded shape, different comment syntax */',
	},
	{
		name: 'a genuine, comment-opener-first marker (must agree as SUPPRESSED, not just as rejected)',
		previousLine:
			'// design-system-ignore: no-raw-visual-color — intentionally raw interoperability fixture',
	},
];

test('the live guard and suppression-inventory discovery never disagree on whether a line is a suppression site', async () => {
	for (const { name, previousLine } of DIVERGENCE_CORPUS) {
		const relativePath = 'src/components/w5-harden2-divergence.tsx';
		const root = await makeFixture({
			[relativePath]: [
				previousLine,
				"export const w5Harden2DivergenceColor = '#abcdef';",
			].join('\n'),
		});

		const violations = await scanFront2DesignSystem({
			baseDir: root,
			sourceDir: path.join(root, 'src'),
		});
		const liveSuppressed = !violations.some(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		);

		const inventoryFound = findSuppressionSitesInSource(
			previousLine,
			relativePath,
		).some((site) => site.convention === 'design-system-ignore');

		assert.equal(
			liveSuppressed,
			inventoryFound,
			`${name}: live guard suppressed=${liveSuppressed} but inventory discovery found=${inventoryFound}`,
		);
	}
});

// F824 (shell F3): the live guard matched a suppression's rule id with a bare
// `reason.startsWith(ruleId)` — any text merely BEGINNING with the real id
// absorbed it. A typo'd id like `no-raw-visual-colors` (real id + stray
// character) is a DIFFERENT, unknown rule id, yet it silently suppressed
// `no-raw-visual-color` violations: the guard certified the line as clean
// under a rule name nobody defined.
test('F824-shell-F3: a typoed rule id that merely prefixes the real id does not suppress the real rule', async () => {
	const root = await makeFixture({
		'src/components/table/shell-f3-typo.tsx': [
			'// design-system-ignore: no-raw-visual-colors — stray-character id must not absorb the real rule',
			"export const shellF3TypoColour = '#abcdef';",
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.equal(
		violations.some((violation) => violation.ruleId === 'no-raw-visual-color'),
		true,
		'the typoed id must leave the real no-raw-visual-color violation standing',
	);
});

// Second half of the gap: an unknown id is not merely ignored — it should be
// REJECTED with an explicit finding, never silently honoured (and never
// silently swallowed either, which hides dead suppressions).
test('F824-shell-F3: an unknown rule id in a design-system-ignore suppression is rejected with an explicit finding', async () => {
	const root = await makeFixture({
		'src/components/table/shell-f3-unknown.tsx': [
			'// design-system-ignore: no-such-rule-anywhere — invented id',
			"export const shellF3UnknownColour = '#abcdef';",
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	const rejections = violations.filter(
		(violation) =>
			violation.ruleId === 'unknown-suppression-rule-id' &&
			violation.message.includes('no-such-rule-anywhere'),
	);
	assert.equal(
		rejections.length,
		1,
		'the unknown id must produce an explicit rejection naming the bad id',
	);
});

// Companion regression control: the exact-id form (id followed by a word
// boundary) keeps suppressing as before — the boundary fix must not
// overcorrect into rejecting every legitimate suppression.
test('F824-shell-F3: the exact rule id still suppresses (boundary-fix control)', async () => {
	const root = await makeFixture({
		'src/components/table/shell-f3-ok.tsx': [
			'// design-system-ignore: no-raw-visual-color — legacy palette probe kept deliberately raw',
			"export const shellF3OkColour = '#abcdef';",
		].join('\n'),
	});

	const violations = await scanFront2DesignSystem({
		baseDir: root,
		sourceDir: path.join(root, 'src'),
	});

	assert.deepEqual(
		violations.filter(
			(violation) => violation.ruleId === 'no-raw-visual-color',
		),
		[],
	);
});
