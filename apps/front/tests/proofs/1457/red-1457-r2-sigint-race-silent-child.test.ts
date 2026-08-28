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
 * handshake write). The justification ("200/200 after, 17/100 failures
 * before") lives only in the commit message, so it is replayed NOWHERE.
 * This proof keeps the bug alive.
 *
 * ## Why a static ordering guard — not a runtime race
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
 * Therefore this proof is a **static ordering guard**: it reads the REAL
 * fixture source from the real test file, extracts the exact lines the
 * runtime fixture lays down, and asserts the BUGGY ordering is present
 * (handshake write BEFORE handler installation). This is deterministic and
 * 100% reproducible.
 *
 * ## Three-state discrimination
 *
 * - BUGUE PRÉSENT (bug present): the handler line comes AFTER the
 *   handshake line in the extracted fixture. The assertion
 *   `handlerIdx > handshakeIdx` PASSES. The CI step *Verify paired red
 *   proofs* then turns RED (proof passed when it should fail).
 *
 * - BUGUE ABSENT (bug absent): the handler line comes BEFORE the
 *   handshake line — the fix is present. The assertion FAILS — the
 *   kept-red state the CI step demands.
 *
 * - MESURE IMPOSSIBLE (measurement impossible): the extraction could not
 *   locate the r2 fixture array, the header/footer anchors drifted, or one
 *   of the two critical lines is missing from the extracted fixture. This
 *   state FAILS LOUD with a named reason — it NEVER silently collapses to
 *   `handlerIdx > handshakeIdx = false`.
 *
 * ## Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1457/red-1457-r2-sigint-race-silent-child.test.ts
 *
 * Expected: FAIL — the handler line comes before the handshake line in the
 * current (corrected) develop, so `handlerIdx > handshakeIdx` is false.
 *
 * ## Mutation to introduce the red (restore the bug):
 *   In `apps/front/scripts/guards/check-design-system.test.mts`, inside
 *   the `r2-ignored-sigint-parent.mjs` array (~line 540-542), swap the
 *   two lines so the order is
 *     'process.stdout.write(`RUNNER_PID=...\\nRUNNER_OWNED_ROOT=...\\n`);',
 *     '// Ignore SIGINT: only the budget-expiry SIGKILL may end this tree.',
 *     "process.on('SIGINT', () => {});",
 *   (i.e. the handshake write comes BEFORE the handler installation).
 *
 *   After the mutation the assertion PASSES — exactly the "proof is stale"
 *   signal the CI step is meant to raise.
 *
 * ## Limitations (honest disclosure)
 *
 * This proof guards the LINE ORDERING in the fixture source, not the
 * runtime race itself. If someone refactors the fixture to use a
 * `setTimeout(0)` or `setImmediate()` between the two lines — widening
 * the race window so a runtime test would then be possible — this proof
 * would NOT automatically switch to a runtime assertion. It would
 * continue to check the ordering, and its own header comment would need
 * manual review to remove that limitation note. This is an acceptable
 * trade-off: a deterministic static guard that catches the exact regression
 * the commit fixed is safer than a flaky runtime race that silently
 * collapses to green.
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
		if (i >= body.length) break;
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
 */
function findHandlerLine(lines: string[]): number {
	const index = lines.findIndex((line) => line.includes("process.on('SIGINT'"));
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

describe('r2 fixture SIGINT race — RED: handler installed AFTER the handshake write (#1457)', () => {
	test('the r2 fixture writes the handshake BEFORE installing the SIGINT handler (the buggy ordering the fix corrected)', () => {
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

		// Step 3: Assert the BUGGY ordering.
		//
		// The BUGGY ordering (the bug commit 5c044a936 FIXED) is:
		//   handshake write (stdout.write) comes BEFORE
		//   handler installation (process.on('SIGINT'))
		// i.e. handshakeIdx < handlerIdx.
		//
		// Against the current (corrected) develop, the ordering is
		//   handler installation comes BEFORE
		//   handshake write
		// i.e. handlerIdx < handshakeIdx — the assertion below FAILS.
		// That failure IS the proof (the kept-red state the CI step
		// *Verify paired red proofs* requires).
		//
		// If someone re-inverts the two lines (restoring the bug), the
		// assertion passes — and the CI step *Verify paired red proofs*
		// then turns red, exactly the signal the brief asks for.
		expect(handlerIdx).toBeGreaterThan(handshakeIdx);
	});
});
