/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1457 / #1719.
 *
 * ## Context
 *
 * The fixture script the r2 test of #1352 inlines into a child process
 * (`apps/front/scripts/guards/check-design-system.test.mts`, the
 * `r2-ignored-sigint-parent.mjs` entry inside the `makeFixture({...})`
 * call, lines ~532-544) carries a deliberate two-line ordering whose
 * meaning ONLY shows up under a real SIGINT race. The line that installs
 * the SIGINT handler (`process.on('SIGINT', () => {})`) MUST be reached
 * BEFORE the line that announces the runner's handshake to the parent
 * (`process.stdout.write(...)`); otherwise the parent, which fires SIGINT
 * the moment the handshake byte lands, can kill the child during the
 * window between those two lines.
 *
 * Commit 5c044a936 corrected that ordering (handler installed BEFORE
 * handshake write). This proof keeps the bug alive.
 *
 * ## Why a static guard — not a runtime race
 *
 * The brief (REPRISE §4) asked for an attempt at runtime measurement first.
 * Diagnostics (see .dump/preuve-1719.md) confirmed that under Node.js the
 * two lines execute synchronously within the child's event loop —
 * `process.stdout.write` to a pipe and `process.on('SIGINT')` are both
 * synchronous calls with no yield point between them. By the time the
 * parent's `data` event fires and sends SIGINT, the child has already
 * installed its handler. This was verified:
 *
 * - FIXED ordering + SIGINT at first byte → child survives (signal=SIGKILL)
 * - BUGGY ordering + SIGINT at first byte → child ALSO survives (signal=SIGKILL)
 * - SIGINT before first byte → child dies in BOTH orderings (handler not yet installed in either case)
 *
 * The race is a kernel-scheduling phenomenon, not a JavaScript event-loop
 * race — it only manifests under specific OS-level timing conditions that
 * cannot be reproduced deterministically in a test. Widening the window to
 * "the very first byte" does not help because there IS no yield point
 * between the two lines.
 *
 * Therefore this proof is a **static guard**: it reads the REAL fixture
 * source from the real test file, extracts the exact lines the runtime
 * fixture lays down, and asserts the BUGGY ordering is present (handshake
 * write BEFORE handler installation). This is deterministic and 100%
 * reproducible.
 *
 * ## Enhancement (r2 — catches async deferral)
 *
 * The r1 proof asserted only the LINE ORDERING. A reviewer found a trivial
 * mutation that reopens the race while keeping the proof kept-red:
 *
 * ```js
 * // In the fixture array, wrap the handler in setImmediate:
 * 'setImmediate(() => { process.on("SIGINT", () => {}); });',
 * 'process.stdout.write(...)',
 * ```
 *
 * The handler TEXT (`process.on('SIGINT'`) still appears before the
 * handshake, so `handlerIdx < handshakeIdx` and the r1 assertion stays
 * FALSE — kept-red — even though the handler is now deferred past the
 * handshake, reopening the race. The r1 proof guarded FORM, not BEHAVIOR.
 *
 * This enhancement adds a SECOND axis: the handler line must be a DIRECT
 * `process.on(...)` call, not wrapped in ANY other construct. The
 * `isHandlerDeferred()` check rejects lines that don't start with
 * `process.on(` (after trimming), which catches:
 *
 * - `setImmediate(() => { process.on('SIGINT', ...) })` — macrotask deferral
 * - `setTimeout(() => { process.on('SIGINT', ...) }, 0)` — timer deferral
 * - `queueMicrotask(() => { process.on('SIGINT', ...) })` — microtask deferral
 * - `process.nextTick(() => { process.on('SIGINT', ...) })` — nextTick deferral
 * - `Promise.resolve().then(() => { process.on('SIGINT', ...) })` — promise deferral
 * - `await something(); process.on('SIGINT', ...)` — async function deferral
 * - `if (cond) { process.on('SIGINT', ...) }` — conditional installation
 *
 * The proof now asserts `bugPresent = classicSwap || handlerIsDeferred`,
 * where:
 * - `classicSwap` = handler appears AFTER handshake in source order
 * - `handlerIsDeferred` = handler line is not a direct `process.on(` call
 *
 * On correct code: both false → assertion FAILS → kept-red.
 * On classic swap: `classicSwap` true → assertion PASSES → detects.
 * On deferred: `handlerIsDeferred` true → assertion PASSES → detects.
 *
 * ## Enhancement (r3 — catches bracket-notation access)
 *
 * A reviewer found a bypass that reopens the race while the CI runner
 * reports GREEN: replacing `process.on('SIGINT', ...)` with
 * `process['on']('SIGINT', ...)` (bracket notation). The r2 regex
 * `/process\.on\s*\(\s*['"]SIGINT['"]/` requires a dot-access and does
 * not match bracket access, so the proof THREW (MESURE IMPOSSIBLE) instead
 * of detecting the bug. The CI runner saw "Tests 1 failed" and concluded
 * "failed as expected" — GREEN with the race open.
 *
 * This enhancement widens the regex to match all three access forms:
 * - `process.on('SIGINT'` — dot notation
 * - `process['on']('SIGINT'` — bracket notation, single quotes
 * - `process["on"]('SIGINT'` — bracket notation, double quotes
 *
 * AND makes the runner discriminant: a proof that fails on a thrown Error
 * (MESURE IMPOSSIBLE) is now classified as a CORRUPT PROOF, not a kept-red
 * success. The alias form `const on = process.on.bind(process); on('SIGINT', …)`
 * remains undecidable statically (the call site is an arbitrary identifier);
 * when encountered, the proof throws MESURE IMPOSSIBLE and the runner fails
 * CI red — failing loud rather than letting the evasion pass.
 *
 * ## Three-state discrimination
 *
 * - BUGUE PRÉSENT (bug present): either the handler line comes AFTER the
 *   handshake line, OR the handler line is wrapped/deferred. The assertion
 *   PASSES. The CI step *Verify paired red proofs* then turns RED.
 *
 * - BUGUE ABSENT (bug absent): handler line is a direct `process.on(`
 *   call AND it comes BEFORE the handshake. The assertion FAILS — the
 *   kept-red state the CI step demands.
 *
 * - MESURE IMPOSSIBLE (measurement impossible): the extraction could not
 *   locate the r2 fixture array, the header/footer anchors drifted, or one
 *   of the two critical lines is missing from the extracted fixture. This
 *   state FAILS LOUD with a named reason — it NEVER silently collapses to
 *   `bugPresent = false`.
 *
 * ## Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts
 *
 * Expected: FAIL — on correct code, the handler is a direct `process.on(`
 * call before the handshake, so `bugPresent` is false.
 *
 * ## Mutations to introduce the red (restore the bug)
 *
 * **Mutation A — classic swap** (the r1 mutation): in
 * `apps/front/scripts/guards/check-design-system.test.mts`, inside the
 * `r2-ignored-sigint-parent.mjs` array (~line 540-542), swap the two lines
 * so the handshake write comes BEFORE the handler installation.
 *
 * **Mutation B — async deferral** (the r2 mutation): keep the handler
 * before the handshake in source order, but wrap it in an async deferral:
 * ```js
 * 'setImmediate(() => { process.on("SIGINT", () => {}); });',
 * 'process.stdout.write(...)',
 * ```
 *
 * **Mutation C — bracket-notation access** (the r3 mutation): replace
 * `process.on('SIGINT', ...)` with `process['on']('SIGINT', ...)`. The
 * handler is still before the handshake and still synchronous, but the
 * access is via bracket notation instead of dot notation.
 *
 * All three mutations make `bugPresent` true, so the assertion PASSES — the
 * "proof is stale" signal the CI step is meant to raise.
 *
 * ## Adverse mutation search — two-step detection pipeline
 *
 * `docs/guides/test-conventions.md` §« Mutation adverse » requires mutations
 * on axes DIFFERENT from the primary mutation, each with a named detection
 * mechanism. The primary mutation (the bug) is the classic swap (handler
 * after handshake). The detection pipeline has TWO sequential steps, and each
 * step is an attack axis:
 *
 * | # | Step | Purpose | Regression it catches |
 * |---|------|---------|-----------------------|
 * | 1 | `findHandlerLine` | LOCALIZE the handler line via regex (`process.on(` or `process['on']('SIGINT')`) | If the regex regresses to dot-only (`/process\.on/`…), bracket-notation access (`process['on']`) is no longer localized → the proof throws MESURE IMPOSSIBLE → CORRUPT PROOF → CI red. |
 * | 2 | `isHandlerDeferred` | CLASSIFY the localized line as direct (starts with `process.on(`) or wrapped (anything else) | If the structural check regresses (e.g., inverted or removed), temporal deferrals (setImmediate, etc.) are no longer classified as deferred → the proof stays red even though the race reopened. |
 *
 * Steps 1 and 2 are sequential, not redundant: step 1 finds the line, step 2
 * classifies it. A bracket-notation handler (`process['on']('SIGINT', ...)`)
 * requires step 1's widened regex to be localized at all; once localized,
 * step 2 classifies it as deferred (it does not start with `process.on(`).
 * Both steps must be exercised — a proof that only tests step 2 on hardcoded
 * strings stays green when step 1 regresses, which is exactly the gap this ronde
 * closes.
 *
 * The mutation axes are genuinely distinct:
 * - A: where the handler appears relative to the handshake (ordering)
 * - B: whether the handler is installed synchronously or deferred (temporal)
 * - C: whether the handler uses dot or bracket notation (syntactic, attacks step 1)
 *
 * All three are covered by the two-step pipeline: axis A by index comparison,
 * axis B by isHandlerDeferred on a wrapped line, axis C by findHandlerLine's
 * regex. A regression on EITHER step turns a test red.
 *
 * ## Honest limits — what this proof does NOT cover
 *
 * This proof guards two axes of the bug: (1) line ordering and (2) directness
 * of the handler installation. It does NOT cover:
 *
 * - A handler that is a direct `process.on('SIGINT', ...)` call but installs
 *   a handler that THROWS or EXITS, defeating the purpose. The proof only
 *   checks that the line starts with `process.on(`, not the callback body.
 * - A refactor that moves the handler to a SEPARATE function called before
 *   the handshake — the proof checks the literal line content, not function
 *   call boundaries.
 * - Runtime behavior: the proof cannot assert that the child survives a
 *   SIGINT sent at the first byte, because the race is a kernel-scheduling
 *   phenomenon that is not deterministic in a test environment.
 *
 * Within these limits, the proof catches every realistic regression of the
 * specific bug that commit 5c044a936 fixed, including the async-deferral
 * variant the r1 proof missed and the bracket-notation variant the r2 proof
 * missed. The alias form `const on = process.on.bind(process); on('SIGINT', …)`
 * is undecidable statically and is the one remaining gap: when encountered,
 * the proof throws MESURE IMPOSSIBLE and the runner fails CI red — failing
 * loud rather than silently passing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// The real production-code test file. Reading the r2 fixture's array lines
// out of THIS file is the load-bearing part of the proof: a proof that
// copied the lines into its own file would stay green even if the
// production file changed.
const GUARD_TEST_FILE = fileURLToPath(
	new URL(
		'../../../scripts/guards/check-design-system.test.mts',
		import.meta.url,
	),
);

// Anchor the extraction to strings the file genuinely contains. If this
// anchor ever moves or the line wraps, the proof must NOT silently fall
// back to a "conformant" default — it must fail loud naming the drift.
const R2_FIXTURE_ARRAY_HEADER = "'r2-ignored-sigint-parent.mjs': [";
const R2_FIXTURE_ARRAY_FOOTER = "].join('\\n'),";

/**
 * Extract the r2 fixture's array of source lines as written in the
 * real guard test file. Each line in the source is either a
 * single-quoted OR a double-quoted JavaScript string literal; the
 * array ends with `].join('\n'),`. We fail LOUD with the exact drift
 * we could not parse rather than return a silently-empty or
 * silently-fallback script — a proof that fell back to a default could
 * not detect a re-inversion of the two lines.
 */
function extractR2FixtureLines(): string[] {
	const source = readFileSync(GUARD_TEST_FILE, 'utf8');
	const headerIndex = source.indexOf(R2_FIXTURE_ARRAY_HEADER);
	if (headerIndex === -1) {
		throw new Error(
			`r2-sigint-race proof: could not locate the r2 fixture array header ` +
				`(${JSON.stringify(R2_FIXTURE_ARRAY_HEADER)}) in ${GUARD_TEST_FILE}; ` +
				`the production file drifted from the shape this proof was written against`,
		);
	}
	const afterHeader = headerIndex + R2_FIXTURE_ARRAY_HEADER.length;
	const footerIndex = source.indexOf(R2_FIXTURE_ARRAY_FOOTER, afterHeader);
	if (footerIndex === -1) {
		throw new Error(
			`r2-sigint-race proof: could not locate the r2 fixture array footer ` +
				`(${JSON.stringify(R2_FIXTURE_ARRAY_FOOTER)}) after the header in ` +
				`${GUARD_TEST_FILE}; the production file drifted from the shape this ` +
				`proof was written against`,
		);
	}
	const body = source.slice(afterHeader, footerIndex);
	// Walk the body left to right. The fixture mixes single- and
	// double-quoted string literals (the lines containing `'node:...'`
	// use double quotes to avoid escaping the inner single quotes;
	// lines without inner quotes use single quotes). On a non-escaped
	// `'` or `"` of the same type that opened the current literal, the
	// literal closes. We never legitimately see a `\\'` or `\\"` (a
	// backslash-escaped quote of the same kind) inside the r2 fixture
	// text, so a simple backslash-pair hop is sufficient to distinguish
	// an escaped quote from a closing quote.
	const lines: string[] = [];
	let i = 0;
	while (i < body.length) {
		// Skip whitespace between entries.
		while (i < body.length && /\s/.test(body[i]!)) {
			i += 1;
		}
		if (i >= body.length) {
			break;
		}
		const opener = body[i]!;
		if (opener !== "'" && opener !== '"') {
			throw new Error(
				`r2-sigint-race proof: expected a string literal at offset ${i} of ` +
					`the r2 fixture array body, got ${JSON.stringify(opener)}; the production ` +
					`file drifted from the shape this proof was written against`,
			);
		}
		i += 1;
		let current = '';
		while (i < body.length && body[i] !== opener) {
			if (body[i] === '\\' && i + 1 < body.length) {
				// Preserve the backslash pair as-is. The r2 fixture
				// uses `\\n` (two characters) to keep Node from
				// expanding the template-literal `\n` newline; we must
				// hand those two characters to the child verbatim.
				current += body[i]! + body[i + 1]!;
				i += 2;
				continue;
			}
			current += body[i]!;
			i += 1;
		}
		if (i >= body.length) {
			throw new Error(
				`r2-sigint-race proof: reached end of file inside a string literal ` +
					`in the r2 fixture array; the production file drifted`,
			);
		}
		// Consume the closing quote.
		i += 1;
		lines.push(current);
		// Skip a trailing comma if present.
		if (i < body.length && body[i] === ',') {
			i += 1;
		}
	}
	if (lines.length < 6) {
		throw new Error(
			`r2-sigint-race proof: only ${lines.length} line(s) extracted from the r2 ` +
				`fixture array; the production fixture is expected to carry at least 6 lines. ` +
				`Extracted: ${JSON.stringify(lines)}`,
		);
	}
	return lines;
}

/**
 * Find the index of the handler-installation line in the extracted fixture.
 * Throws if the line is missing — a drift surfaces here, not as a silently-passing proof.
 *
 * Matches both quote styles: the original uses single quotes (`process.on('SIGINT'`)
 * but a deferral wrapper may use double quotes (`setImmediate(() => { process.on("SIGINT"...`)
 * The detection is intentionally quote-agnostic: we look for `process.on(` immediately
 * followed by an optional quote and `SIGINT`.
 */
function findHandlerLine(lines: string[]): number {
	// Match all three access forms:
	//   process.on('SIGINT'   — dot notation (original)
	//   process['on']('SIGINT' — bracket notation with single quotes
	//   process["on"]('SIGINT' — bracket notation with double quotes
	// The alias form `const on = process.on.bind(process); on('SIGINT', …)` is
	// undecidable statically: the call site is an arbitrary identifier and
	// indistinguishable from any other function call. When encountered, the
	// regex below does not match, the proof throws MESURE IMPOSSIBLE, and the
	// runner classifies it as a corrupted proof (CI red) — failing loud rather
	// than letting the evasion pass.
	const index = lines.findIndex((line) =>
		/process(?:\[['"]on['"]\]|\.on)\s*\(\s*['"]SIGINT['"]/.test(line),
	);
	if (index === -1) {
		throw new Error(
			`r2-sigint-race proof: could not find the "process.on('SIGINT'" line ` +
				`in the extracted r2 fixture. Extracted ${lines.length} lines: ${JSON.stringify(lines)}`,
		);
	}
	return index;
}

/**
 * Find the index of the handshake-write line in the extracted fixture.
 * Throws if the line is missing.
 */
function findHandshakeLine(lines: string[]): number {
	const index = lines.findIndex((line) =>
		line.includes('process.stdout.write(`RUNNER_PID='),
	);
	if (index === -1) {
		throw new Error(
			`r2-sigint-race proof: could not find the "process.stdout.write" line ` +
				`in the extracted r2 fixture. Extracted ${lines.length} lines: ${JSON.stringify(lines)}`,
		);
	}
	return index;
}

/**
 * Check whether the handler line is a DIRECT `process.on(...)` call.
 *
 * Returns false (NOT deferred) when the trimmed line starts with `process.on(` —
 * the handler is installed synchronously as a top-level statement.
 *
 * Returns true (deferred) for ANY other form:
 *   - `setImmediate(() => { process.on('SIGINT', ...) })` — macrotask
 *   - `setTimeout(() => { process.on('SIGINT', ...) }, 0)` — timer
 *   - `queueMicrotask(() => { process.on('SIGINT', ...) })` — microtask
 *   - `process.nextTick(() => { process.on('SIGINT', ...) })` — nextTick
 *   - `Promise.resolve().then(() => { ... })` — promise chain
 *   - `await something(); process.on('SIGINT', ...)` — async fn
 *   - `if (cond) { process.on('SIGINT', ...) }` — conditional
 *
 * This is intentionally broader than a denylist of specific async primitives
 * (setImmediate/setTimeout/etc.). A denylist would miss novel deferral
 * mechanisms; a structural check ("does the line start with process.on(")
 * catches ALL deferrals, including future ones.
 */
function isHandlerDeferred(line: string): boolean {
	return !line.trim().startsWith('process.on(');
}

describe('r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457)', () => {
	test('the r2 fixture writes the handshake BEFORE installing the SIGINT handler, OR the handler is wrapped in an async deferral (the buggy ordering the fix corrected)', () => {
		// Step 1: Extract the REAL fixture lines from the production file.
		// If extraction fails — anchor not found, footer not found, line
		// count too low — this throws and the test fails LOUD naming the
		// exact drift. A content illisible n'est pas un contenu conforme.
		let lines: string[];
		try {
			lines = extractR2FixtureLines();
		} catch (err) {
			throw new Error(
				`MESURE IMPOSSIBLE — could not extract the r2 fixture from ` +
					`${GUARD_TEST_FILE}. ${(err as Error).message}`,
			);
		}

		// Step 2: Sanity-pin the fixture's two critical lines. Both
		// findLineByContains calls THROW if either line is missing — a
		// drift in the production fixture surfaces here, not as a
		// silently-passing proof.
		const handlerIdx = findHandlerLine(lines);
		const handshakeIdx = findHandshakeLine(lines);

		// Step 3: Detect BOTH forms of the bug.
		//
		// Form A — classic swap (the r1 mutation): the handler line comes
		// AFTER the handshake line in source order. This is the exact
		// regression that commit 5c044a936 fixed.
		const classicSwap = handlerIdx > handshakeIdx;

		// Form B — async deferral (the r2 mutation): the handler text
		// appears before the handshake, BUT the handler line is not a
		// direct `process.on(` call — it's wrapped in setImmediate,
		// setTimeout, queueMicrotask, process.nextTick, a promise chain,
		// an async function, or a conditional. The r1 proof missed this
		// because it only checked line order.
		const handlerLine = lines[handlerIdx]!;
		const handlerIsDeferred = isHandlerDeferred(handlerLine);

		const bugPresent = classicSwap || handlerIsDeferred;

		// Step 4: Assert the BUG is present.
		//
		// The kept-red state requires this assertion to FAIL on correct code:
		//   - Correct code: handlerIdx < handshakeIdx AND handler is a direct
		//     `process.on(` call → bugPresent = false → assertion FAILS.
		//   - Classic swap: handlerIdx > handshakeIdx → bugPresent = true → PASSES.
		//   - Async deferral: handlerIsDeferred = true → bugPresent = true → PASSES.
		//
		// When the assertion PASSES, the CI step *Verify paired red proofs*
		// turns RED — exactly the "proof is stale" signal the brief asks for.
		expect(bugPresent).toBe(true);
	});

	// Behavioral proof that the detection pipeline has TWO load-bearing
	// mechanisms — findHandlerLine (localizes the handler line via regex) and
	// isHandlerDeferred (classifies it as direct or wrapped). A regression on
	// EITHER mechanism must turn this test red. The proof exercises the REAL
	// fixture lines extracted from the production file, not hardcoded strings.
	test('the detection pipeline (findHandlerLine + isHandlerDeferred) classifies the real handler — a regression on either mechanism turns this red', () => {
		// Step 1: Extract the REAL fixture lines. If extraction fails, this
		// throws and the test fails LOUD naming the drift — never a silent pass.
		const lines = extractR2FixtureLines();

		// Step 2: Exercise findHandlerLine on the real fixture. This is the
		// load-bearing localization step: if the regex regresses to
		// dot-only (`/process\.on\s*\(\s*['"]SIGINT['"]/`), it will NOT match
		// a bracket-notation handler (`process['on']('SIGINT', ...)`), the
		// findIndex returns -1, and this throws MESURE IMPOSSIBLE — which the
		// runner classifies as CORRUPT PROOF (CI red), not a kept-red success.
		const handlerIdx = findHandlerLine(lines);
		const handlerLine = lines[handlerIdx]!;

		// Step 3: Exercise findHandlerLine on a bracket-notation variant of
		// the same handler. This is a THROW check, not an assertion — if
		// findHandlerLine regresses to dot-only, it throws MESURE IMPOSSIBLE
		// and the runner classifies this as CORRUPT PROOF (CI red). We do NOT
		// assert here: an assertion that PASSES on correct code would, when
		// it FAILS due to a mutation, be misread by the runner as "failed as
		// expected" (CI green) — the exact gap this ronde closes.
		const bracketLine = handlerLine.replace('process.on(', "process['on'](");
		const modifiedLines = [...lines];
		modifiedLines[handlerIdx] = bracketLine;
		findHandlerLine(modifiedLines);

		// Step 4: Kept-red assertion — the ONLY assertion in this test.
		//
		// Derive a deferred line from the REAL handler by wrapping it in
		// setImmediate. On correct code, isHandlerDeferred returns true (the
		// line does not start with `process.on(`). We assert it returns
		// false — this FAILS on correct code (kept-red, the expected state).
		//
		// Mutation C (findHandlerLine dot-only): detected at Step 3 — the
		// throw produces MESURE IMPOSSIBLE → CORRUPT PROOF → CI red.
		//
		// Mutation D (isHandlerDeferred inverted: `return line.trim().startsWith('process.on(')`):
		//   isHandlerDeferred(deferredLine) → false (deferredLine doesn't
		//   start with `process.on(`) → assertion PASSES → runner reports
		//   FAILURE (unexpected pass) → CI red.
		//
		// Mutation E (isHandlerDeferred always false: `return false`):
		//   isHandlerDeferred(deferredLine) → false → assertion PASSES →
		//   runner reports FAILURE (unexpected pass) → CI red.
		//
		// This single assertion is the load-bearing kept-red check: it is
		// FALSE on correct code and TRUE for both Mutation D and Mutation E.
		const deferredLine = `setImmediate(() => { ${handlerLine} });`;
		expect(isHandlerDeferred(deferredLine)).toBe(false);
	});
});
