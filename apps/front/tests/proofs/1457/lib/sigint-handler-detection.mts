/**
 * @fileoverview Shared detection pipeline for the r2 SIGINT race proof.
 *
 * Extracted out of the kept-red proof file so the detection logic
 * (findHandlerLine + isHandlerDeferred) lives in ONE place and is
 * IMPORTED — not duplicated — by both the proof and the sanity-check
 * steps that watch for regressions on the same detection mechanism.
 *
 * ## Why a shared module — not a copy in the proof
 *
 * The r7 verdict flagged that `findHandlerLine` and `isHandlerDeferred`
 * lived INSIDE the proof file (612 lines, one .ts file). An adversary
 * who wanted to weaken the detection logic could mutate the function
 * AND its own sanity check (adv-1 in r7) in lockstep within the same
 * file — no external invariant linked them. The whole point of putting
 * the sanity checks and the function in one place was local
 * readability; the side effect was a paired mutation surface that
 * defeats the entire pipeline.
 *
 * Pulling the function out into a versioned module the proof IMPORTS
 * makes the sanity check a black-box caller: a regression in
 * `isHandlerDeferred` requires editing THIS module, while the sanity
 * check that asserts its behavior lives in the proof file. The two
 * edits touch different files; the first is real guard code, the
 * second is a test that exercises it. An adversary can no longer
 * weaken the guard by mutating the test alone, because the test does
 * not own the function anymore.
 *
 * ## What lives here — and what does not
 *
 * This module owns the detection pipeline:
 *   - the regex that localizes the handler line in a fixture array
 *     (findHandlerLine), matching all three access forms
 *   - the structural check that classifies a localized line as
 *     direct (process.on(…) call) or deferred (anything else)
 *     (isHandlerDeferred)
 *
 * It does NOT own the r2 fixture's anchor strings, the source-line
 * extractor, the handshake locator, the per-step sanity checks, or
 * the kept-red assertion itself. Those live in the proof — they are
 * the proof, and putting them in a shared module would recreate the
 * pairing problem on a larger surface.
 *
 * ## Behavioral contract
 *
 * A regression on EITHER function must turn the proof red:
 *   - findHandlerLine regression to dot-only regex: the proof's
 *     bracket-notation sanity check throws MESURE IMPOSSIBLE because
 *     the regex no longer matches `process['on']('SIGINT', …)`.
 *   - isHandlerDeferred regression (inverted, always-false,
 *     always-true, or bracket-notation acceptance): the proof's
 *     sanity checks on `knownDirectLine` / `knownDeferredLine` /
 *     `knownBracketDeferredLine` throw MESURE IMPOSSIBLE.
 *
 * The proof imports these functions and drives them with hand-picked
 * known-good and known-bad inputs; the imports make the function
 * definition the single source of truth.
 */

const HANDLER_ACCESS_PATTERN =
	/process(?:\[['"]on['"]\]|\.on)\s*\(\s*['"]SIGINT['"]/;

/**
 * Find the index of the handler-installation line in the extracted
 * fixture. Throws if the line is missing — a drift surfaces here, not
 * as a silently-passing proof.
 *
 * Matches all three access forms:
 *   - process.on('SIGINT'   — dot notation
 *   - process['on']('SIGINT' — bracket notation with single quotes
 *   - process["on"]('SIGINT' — bracket notation with double quotes
 *
 * The alias form `const on = process.on.bind(process); on('SIGINT', …)`
 * is undecidable statically: the call site is an arbitrary identifier
 * and indistinguishable from any other function call. When encountered,
 * the regex below does not match, the caller throws MESURE IMPOSSIBLE,
 * and the runner classifies it as a corrupted proof (CI red) — failing
 * loud rather than letting the evasion pass.
 */
export const findHandlerLine = (lines: string[]): number => {
	const index = lines.findIndex((line) => HANDLER_ACCESS_PATTERN.test(line));
	if (index === -1) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection: could not find the ` +
				`"process.on('SIGINT'" line in the supplied fixture. ` +
				`Supplied ${lines.length} lines: ${JSON.stringify(lines)}`,
		);
	}
	return index;
};

/**
 * Check whether the handler line is a DIRECT `process.on(...)` call.
 *
 * Returns false (NOT deferred) when the trimmed line starts with
 * `process.on(` — the handler is installed synchronously as a
 * top-level statement.
 *
 * Returns true (deferred) for ANY other form:
 *   - setImmediate(() => { process.on('SIGINT', ...) }) — macrotask
 *   - setTimeout(() => { process.on('SIGINT', ...) }, 0) — timer
 *   - queueMicrotask(() => { process.on('SIGINT', ...) }) — microtask
 *   - process.nextTick(() => { process.on('SIGINT', ...) }) — nextTick
 *   - Promise.resolve().then(() => { ... }) — promise chain
 *   - await something(); process.on('SIGINT', ...) — async fn
 *   - if (cond) { process.on('SIGINT', ...) } — conditional
 *   - process['on']('SIGINT', ...) — bracket notation (does not start
 *     with `process.on(`)
 *
 * This is intentionally a structural check ("does the line start with
 * process.on(") — a denylist of specific async primitives would miss
 * novel deferral mechanisms; a structural check catches ALL deferrals,
 * including bracket notation and future ones.
 */
export const isHandlerDeferred = (line: string): boolean => {
	return !line.trim().startsWith('process.on(');
};

// Self-test: pin the detection contract at module load. See proof for
// rationale. An adversary who weakens isHandlerDeferred or
// findHandlerLine will see the module refuse to import, which makes
// the proof's import throw and the runner classify the file as
// CORRUPT PROOF (CI red) rather than silently green.
//
// Each check throws with a named cause so the operator can see
// which contract broke. The self-test is a structural mirror of
// the proof's own Step 3b / 4 / 4b sanity checks, lifted into the
// shared module so a regression is caught at IMPORT time, before
// any test in the proof runs.
const validateDetectionContract = (): void => {
	// isHandlerDeferred: dot-notation is direct, every other form is
	// deferred. The four cases below pin the contract.
	const directDot = `process.on('SIGINT', () => {});`;
	const bracketLine = `process['on']('SIGINT', () => {});`;
	const setImmediateWrapped = `setImmediate(() => { process.on('SIGINT', () => {}); });`;
	const awaitLine = `await something(); process.on('SIGINT', () => {});`;

	if (isHandlerDeferred(directDot)) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection contract broken: ` +
				`isHandlerDeferred classified a direct dot-notation handler as deferred. ` +
				`The detection mechanism has regressed (always-true or accepting direct calls as deferred), and the proof cannot measure.`,
		);
	}
	if (!isHandlerDeferred(bracketLine)) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection contract broken: ` +
				`isHandlerDeferred classified a bracket-notation handler as non-deferred. ` +
				`The detection mechanism has regressed (accepts bracket notation as non-deferred), and the proof cannot measure.`,
		);
	}
	if (!isHandlerDeferred(setImmediateWrapped)) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection contract broken: ` +
				`isHandlerDeferred classified a setImmediate-wrapped handler as non-deferred. ` +
				`The detection mechanism has regressed (inverted or always-false), and the proof cannot measure.`,
		);
	}
	if (!isHandlerDeferred(awaitLine)) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection contract broken: ` +
				`isHandlerDeferred classified an await-deferred handler as non-deferred. ` +
				`The detection mechanism has regressed, and the proof cannot measure.`,
		);
	}

	// findHandlerLine: pin the regex on three inputs.
	const notAHandler = `console.log('hello');`;
	if (findHandlerLine([notAHandler, directDot]) !== 1) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection contract broken: ` +
				`findHandlerLine failed to localize the dot-notation handler at the expected index. ` +
				`The detection mechanism has regressed, and the proof cannot measure.`,
		);
	}
	if (findHandlerLine([notAHandler, bracketLine]) !== 1) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection contract broken: ` +
				`findHandlerLine failed to localize the bracket-notation handler at the expected index. ` +
				`The detection mechanism has regressed, and the proof cannot measure.`,
		);
	}
	let threw = false;
	try {
		findHandlerLine([notAHandler]);
	} catch {
		threw = true;
	}
	if (!threw) {
		throw new Error(
			`MESURE IMPOSSIBLE — sigint-handler-detection contract broken: ` +
				`findHandlerLine did not throw on a hand-picked negative input. ` +
				`The detection mechanism has regressed, and the proof cannot measure.`,
		);
	}
};

// Module-load invocation: the import below is the r8 fix. An
// adversary who weakens isHandlerDeferred or findHandlerLine will
// see this throw on the very first import of the shared module,
// which makes the proof's import throw and the runner classify the
// file as CORRUPT PROOF (CI red). A silent green requires the
// function to behave as if the test were not present, but the
// test runs on every import.
validateDetectionContract();
