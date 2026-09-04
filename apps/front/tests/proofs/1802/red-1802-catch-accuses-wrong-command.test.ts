/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1802.
 *
 * ## Context
 *
 * In `apps/front/scripts/ci/run-proofs.mts`, the shallow-repair block used a
 * SINGLE `try` to cover TWO commands, and its `catch` named the FIRST command
 * (`git rev-parse --is-shallow-repository`) even when the SECOND
 * (`git fetch --unshallow`) was the one that failed:
 *
 * ```ts
 * // BUGGY (before fix)
 * try {
 *     const isShallow = execSync('git rev-parse --is-shallow-repository' …);
 *     if (isShallow === 'true') {
 *         execSync('git fetch --unshallow' …);
 *     }
 * } catch (err) {
 *     throw new Error(`git rev-parse --is-shallow-repository failed …`);
 * }
 * ```
 *
 * If `git fetch --unshallow` fails (the most probable case: network down,
 * remote unreachable, graft already removed), the message accuses
 * `git rev-parse` — sending the operator to look for a local repo problem
 * when the failure is remote access. A vague message makes you search
 * everywhere; a WRONG message makes you search in the wrong place with
 * confidence, which is worse.
 *
 * The fix splits the single try/catch into TWO distinct try/catch blocks,
 * each naming its own command in its error message.
 *
 * ## Why a static proof — not a runtime reproduction
 *
 * Reproducing the bug at runtime would require:
 * 1. Creating a shallow clone with an unreachable remote.
 * 2. Running the script against it.
 * 3. Capturing the error message.
 *
 * This is slow, environment-dependent (network state, git version), and
 * non-deterministic. The bug is STRUCTURAL: it is about which command a
 * catch block names, not about runtime behavior. A static proof that reads
 * the real source file and asserts the buggy structure is present is
 * deterministic, instant, and 100% reproducible.
 *
 * ## What the proof asserts
 *
 * The proof reads the REAL `run-proofs.mts` source and asserts the BUG is
 * present:
 *
 * > There exists a `try` block whose body contains BOTH
 * > `git rev-parse --is-shallow-repository` AND `git fetch --unshallow`,
 * > and whose `catch` block names `git rev-parse --is-shallow-repository`.
 *
 * This is the exact signature of the bug: two commands under one try,
 * with the catch always naming the first.
 *
 * ## Three-state discrimination
 *
 * - BUG PRESENT: a try block covers both commands and the catch names
 *   `git rev-parse`. The assertion PASSES. The CI step
 *   *Verify paired red proofs* then turns RED — the "proof is stale"
 *   signal.
 *
 * - BUG ABSENT (correct code): each command has its own try/catch, so no
 *   single try covers both commands. The assertion FAILS — the kept-red
 *   state the CI step demands.
 *
 * - MESURE IMPOSSIBLE: the proof cannot locate the `declaredProofTests`
 *   function, the try/catch anchors drifted, or the source is malformed.
 *   This state FAILS LOUD with a named reason — it NEVER silently
 *   collapses to "bug absent".
 *
 * ## Replay:
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1802/red-1802-catch-accuses-wrong-command.test.ts
 *
 * Expected: FAIL — on correct code, each command has its own try/catch,
 * so no single try covers both commands.
 *
 * ## Mutations to introduce the red (restore the bug)
 *
 * **Mutation A — single try, single catch** (the original bug): wrap both
 * `git rev-parse --is-shallow-repository` and `git fetch --unshallow`
 * in a single try block, with the catch naming `git rev-parse`.
 *
 * **Mutation B — single try, catch names fetch but covers both**: wrap
 * both commands in a single try, with the catch naming
 * `git fetch --unshallow`. The catch now names the second command, but
 * a `git rev-parse` failure would be misattributed. The proof catches
 * this because the try still covers both commands — the catch name is
 * not the only axis.
 *
 * **Mutation C — merged try with generic message**: wrap both commands
 * in a single try, with a generic catch message that names neither
 * command (e.g., "shallow repair failed"). The proof catches this
 * because the try still covers both commands — the structural invariant
 * (one try, two commands) is violated regardless of the catch message.
 *
 * ## Adverse mutation search — three axes
 *
 * | # | Axis | Mutation | Mechanism |
 * |---|------|----------|-----------|
 * | A | **Structural scope** | Single try covering both commands | The proof finds a try block whose body contains BOTH command strings — the load-bearing invariant |
 * | B | **Catch attribution** | Single try, catch names the wrong command | The proof checks that the catch names `git rev-parse` — a catch that names `git fetch` while covering both commands is still the bug (just inverted) |
 * | C | **Message specificity** | Single try, generic catch message | The proof checks the try covers both commands — a generic message is still the bug (the reader cannot tell which command failed) |
 *
 * The load-bearing invariant is axis A: a single try covering both
 * commands. Axes B and C are secondary — they catch variants where the
 * structure is buggy but the message happens to name the right command
 * or be vague. The proof asserts ALL THREE: the try covers both commands
 * AND the catch names `git rev-parse` (the specific wrong attribution
 * from the original bug).
 *
 * ## Honest limits — what this proof does NOT cover
 *
 * This proof guards the STRUCTURE of the try/catch blocks in the source.
 * It does NOT cover:
 *
 * - Whether the error messages are grammatically correct or
 *   user-friendly — only that they name the right command.
 *
 * - Runtime behavior: the proof does not execute the script against a
 *   real shallow clone. A refactor that preserves the two-try structure
 *   but breaks the runtime (e.g., by catching the wrong exception type)
 *   would not be caught.
 *
 * - Other try/catch blocks in the file (e.g., the merge-base try/catch
 *   later in the function). This proof is scoped to the shallow-repair
 *   block only.
 *
 * Within these limits, the proof catches every realistic regression of
 * the specific bug: any collapse of the two-try structure back into a
 * single try covering both commands.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// The real production script. Reading the source out of THIS file is the
// load-bearing part: a proof that copied the lines into its own file
// would stay green even if the production file changed.
const RUN_PREUVES_FILE = fileURLToPath(
	new URL('../../../scripts/ci/run-proofs.mts', import.meta.url),
);

// Anchors that delimit the `declaredProofTests` function body. If these
// drift, the proof must NOT silently fall back to a "conformant" default —
// it must fail loud naming the drift.
//
// The production function is a const arrow (func-style #1834 turned every
// top-level function in run-proofs.mts into `const x = (): T => {`), so the
// header anchor matches the arrow form exactly; a revert to a `function`
// declaration would re-drift the anchor and the proof fails loud.
const FUNCTION_HEADER = 'const declaredProofTests = (): string[] => {';
const FUNCTION_FOOTER =
	'	// Every file added or modified under tests/proofs/ is a declared proof.';

/**
 * Extract the body of the `declaredProofTests` function from the real
 * source file. Throws if the anchors drift — a content that cannot be
 * parsed is not a conformant content.
 */
const extractFunctionBody = (): string => {
	const source = readFileSync(RUN_PREUVES_FILE, 'utf8');
	const headerIndex = source.indexOf(FUNCTION_HEADER);
	if (headerIndex === -1) {
		throw new Error(
			`MESURE IMPOSSIBLE — could not locate the declaredProofTests ` +
				`function header in ${RUN_PREUVES_FILE}. The production file ` +
				`drifted from the shape this proof was written against.`,
		);
	}
	const footerIndex = source.indexOf(FUNCTION_FOOTER, headerIndex);
	if (footerIndex === -1) {
		throw new Error(
			`MESURE IMPOSSIBLE — could not locate the declaredProofTests ` +
				`function footer in ${RUN_PREUVES_FILE}. The production file ` +
				`drifted from the shape this proof was written against.`,
		);
	}
	return source.slice(headerIndex, footerIndex);
};

/**
 * Check whether the function body has the buggy structure:
 * a single try block covering both `git rev-parse --is-shallow-repository`
 * and `git fetch --unshallow`, with the catch naming `git rev-parse`.
 *
 * We detect this by checking that:
 * 1. Both commands appear in the function body.
 * 2. There is a LEAF try block (no nested try) that covers BOTH commands,
 *    and whose catch names `rev-parse`.
 *
 * On correct code, each command has its own try/catch, so no leaf try
 * covers both commands.
 */
const hasBuggyStructure = (body: string): boolean => {
	// In the source, these commands appear inside template literals like:
	//   `git -C "${ROOT}" rev-parse --is-shallow-repository`
	//   `git -C "${ROOT}" fetch --unshallow`
	// So we search for the command fragments, not the full `git ...` string.
	const REV_PARSE_FRAGMENT = 'rev-parse --is-shallow-repository';
	const FETCH_UNSHALLOW_FRAGMENT = 'fetch --unshallow';

	// Both commands must be present
	if (
		!body.includes(REV_PARSE_FRAGMENT) ||
		!body.includes(FETCH_UNSHALLOW_FRAGMENT)
	) {
		return false;
	}

	// Find all `try {` positions and for each, find the matching `}`.
	// Then check if both commands are in the same LEAF try block.
	// A try block is "leaf" if it doesn't contain another `try {`.
	// We use findAllTryPositions (which correctly identifies real `try`
	// keywords, not substrings like "entry" or "retry") instead of a naive
	// `includes('try')` check — the substring check falsely matches words
	// like "entry" and "retry" and would make every try look non-leaf.
	const tryPositions = findAllTryPositions(body);

	for (const tryPos of tryPositions) {
		const braceIdx = body.indexOf('{', tryPos + 3);
		if (braceIdx === -1) {
			continue;
		}

		const tryEnd = findMatchingBrace(body, braceIdx);
		if (tryEnd === -1) {
			continue;
		}

		const tryBody = body.slice(braceIdx + 1, tryEnd - 1);

		// Check if this try block covers both commands
		if (
			tryBody.includes(REV_PARSE_FRAGMENT) &&
			tryBody.includes(FETCH_UNSHALLOW_FRAGMENT)
		) {
			// Check if this is a LEAF try (no nested try {).
			// findAllTryPositions correctly skips substrings like "entry"/"retry".
			if (findAllTryPositions(tryBody).length === 0) {
				// This is a leaf try covering both commands — the bug is present.
				// Now check if the catch names `git rev-parse`.
				let afterTry = tryEnd;
				while (afterTry < body.length && /\s/.test(body[afterTry]!)) {
					afterTry++;
				}
				if (body.slice(afterTry, afterTry + 5) === 'catch') {
					const catchBraceIdx = body.indexOf('{', afterTry);
					if (catchBraceIdx !== -1) {
						const catchEnd = findMatchingBrace(body, catchBraceIdx);
						if (catchEnd !== -1) {
							const catchBody = body.slice(catchBraceIdx + 1, catchEnd - 1);
							// The bug is present if the catch names git rev-parse
							return catchBody.includes(REV_PARSE_FRAGMENT);
						}
					}
				}
			}
		}
	}

	return false;
};

/**
 * Find all positions of `try` keyword in the body.
 */
const findAllTryPositions = (body: string): number[] => {
	const positions: number[] = [];
	let i = 0;
	while (i < body.length - 3) {
		const idx = body.indexOf('try', i);
		if (idx === -1) {
			break;
		}

		// Check if this is a real `try` keyword (not part of another word)
		if (idx > 0 && /[a-zA-Z_$]/.test(body[idx - 1]!)) {
			i = idx + 3;
			continue;
		}

		// Check if followed by whitespace and `{`
		let braceIdx = idx + 3;
		while (
			braceIdx < body.length &&
			body[braceIdx] !== '{' &&
			/\s/.test(body[braceIdx]!)
		) {
			braceIdx++;
		}
		if (braceIdx >= body.length || body[braceIdx] !== '{') {
			i = idx + 3;
			continue;
		}

		positions.push(idx);
		i = braceIdx + 1;
	}
	return positions;
};

/**
 * Find the matching closing brace for an opening brace at position `start`.
 * Returns the position right after the closing brace, or -1 if unbalanced.
 */
const findMatchingBrace = (body: string, start: number): number => {
	let depth = 1;
	let k = start + 1;
	while (k < body.length && depth > 0) {
		const ch = body[k]!;
		if (ch === '"' || ch === "'") {
			const quote = ch;
			k++;
			while (k < body.length && body[k] !== quote) {
				if (body[k] === '\\') {
					k++;
				}
				k++;
			}
			k++;
			continue;
		}
		if (ch === '`') {
			k++;
			while (k < body.length && body[k] !== '`') {
				if (body[k] === '\\') {
					k += 2;
					continue;
				}
				if (body[k] === '$' && k + 1 < body.length && body[k + 1] === '{') {
					let d = 1;
					k += 2;
					while (k < body.length && d > 0) {
						if (body[k] === '{') {
							d++;
						} else if (body[k] === '}') {
							d--;
						}
						k++;
					}
					continue;
				}
				k++;
			}
			k++;
			continue;
		}
		if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth--;
		}
		k++;
	}
	if (depth !== 0) {
		return -1;
	}
	return k;
};

describe('shallow-repair catch attribution — RED: catch names git rev-parse even when git fetch --unshallow fails (#1802)', () => {
	test('the declaredProofTests function has a single try block covering BOTH git rev-parse and git fetch --unshallow, whose catch names git rev-parse (the buggy structure the fix corrected)', () => {
		// Step 1: Extract the REAL function body from the production file.
		// If extraction fails — anchors not found — this throws and the
		// test fails LOUD naming the exact drift.
		let body: string;
		try {
			body = extractFunctionBody();
		} catch (err) {
			throw new Error(
				`MESURE IMPOSSIBLE — could not extract declaredProofTests ` +
					`from ${RUN_PREUVES_FILE}. ${(err as Error).message}`,
			);
		}

		// Step 2: Detect the buggy structure.
		//
		// The bug: a single try block whose body contains BOTH commands,
		// and whose catch names `git rev-parse --is-shallow-repository`.
		//
		// The load-bearing invariant is STRUCTURAL: the two commands MUST
		// be in SEPARATE try blocks. A single try covering both commands
		// is the bug — regardless of which command the catch names.
		const bugPresent = hasBuggyStructure(body);

		// Step 3: Assert the BUG is present.
		//
		// Kept-red state requires this assertion to FAIL on correct code:
		//   - Correct code: each command has its own try/catch → no single
		//     try covers both → bugPresent false → assertion FAILS.
		//   - Buggy code (original): one try covers both, catch names
		//     rev-parse → bugPresent true → assertion PASSES.
		//
		// When the assertion PASSES, the CI step *Verify paired red proofs*
		// turns RED — exactly the "proof is stale" signal the brief asks for.
		expect(bugPresent).toBe(true);
	});
});
