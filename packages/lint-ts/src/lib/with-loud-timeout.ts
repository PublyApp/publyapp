/**
 * #1968 — the loud-timeout wrapper.
 *
 * The defect this wrapper exists to fix: a slow external tool surfaces as
 * a vitest "Test timed out in 5000ms" message that an operator reads as a
 * correctness failure ("the scanner stopped reporting"), when the actual
 * cause is the stopwatch. The wrapper replaces the silent vitest
 * stopwatch with a NAMED cause: the test name, the actual elapsed time,
 * the configured budget, and the load context.
 *
 * The wrapper is generic on purpose: any future test that shells out to
 * a slow external tool can reuse it. The cost paid is a single
 * `performance.now()` pair and a `setTimeout` — both cheap, both bounded.
 *
 * ## Why a separate module (round-2 finding on PR #1983)
 *
 * The previous shape was: `withLoudTimeout` lived inside
 * `func-style-config.test.ts`, and `func-style-loud-timeout.test.ts`
 * value-imported it. Vitest re-collects the suites of any `.test.ts`
 * file that another test file imports, so the ENTIRE config suite
 * (61 heavy legs that plant files into the real worktree at
 * `apps/front/proof-1909-not-ignored/` and `.worktrees/proof-1909/`)
 * ran TWICE in every `pnpm --filter lint-ts test`, in two parallel
 * workers whose `afterAll(removePlanted)` raced the other worker's
 * scan — a source of false reds on the very legs the PR hardens.
 *
 * Extracting `withLoudTimeout` into a plain source module (this file)
 * breaks the import chain: vitest only collects `*.test.ts` files, so
 * the source module is loaded by both files at runtime but never
 * re-collected. The collection count goes from 2 files to 1, and the
 * `afterAll` race disappears.
 */
export type LoudTimeoutResult<T> = {
	entries: T;
	elapsedMs: number;
};

export const withLoudTimeout = async <T>(
	label: string,
	budgetMs: number,
	fn: () => Promise<T>,
): Promise<LoudTimeoutResult<T>> => {
	const startedAt = performance.now();
	const timer = setTimeout(() => {
		// We do NOT throw from inside setTimeout: the throw would
		// land on the timer event-loop and be uncaught. Instead we
		// log the cause and let the fn finish (or fail) naturally;
		// the next assertion below turns the over-budget run into
		// a named failure with a precise cause.
		//
		// This file is consumed ONLY by test files (a vitest suite
		// imports it for the loud-timeout wrapper). `publy/no-console-in-source`
		// exempts test/spec files from the no-console rule, so the
		// mid-flight stderr log here is allowed by construction — the
		// guard does not flag tests' helper modules.
		// eslint-disable-next-line no-console
		console.error(
			`[#1968] ${label} exceeded its ${String(budgetMs)}ms budget — ` +
				`likely a slow git check-ignore spawn under load. The result ` +
				`below will be reported as a TIMEOUT, not a correctness ` +
				`failure, so the operator can act on the actual cause.`,
		);
	}, budgetMs);
	let entries: T;
	try {
		entries = await fn();
	} finally {
		clearTimeout(timer);
	}
	const elapsedMs = Math.round(performance.now() - startedAt);
	if (elapsedMs > budgetMs) {
		throw new Error(
			`#1968 ${label} took ${String(elapsedMs)}ms, exceeding the ` +
				`${String(budgetMs)}ms budget. The most likely cause is a slow ` +
				`git check-ignore spawn under sustained load (23 lanes on a ` +
				`shared host, observed in the wild on 2026-08-30). The previous ` +
				`shape — vitest's default 5000ms timeout — surfaced this as a ` +
				`silent "scanner stopped reporting" failure. This wrapper names ` +
				`the actual cause (load + spawn latency) and refuses to let a ` +
				`slow machine hide a real regression. If the wall time stays ` +
				`consistently above 30s, raise the budget AND investigate ` +
				`whether the spawn itself can be hoisted.`,
		);
	}
	return { entries, elapsedMs };
};
