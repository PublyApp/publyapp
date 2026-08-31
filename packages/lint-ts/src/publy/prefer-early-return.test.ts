/**
 * Spec for `publy/prefer-early-return` (issue #1666 — owner product rule:
 * prefer explicit `if` + early `return` over ternaries whose value is
 * returned directly or assigned then returned).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * vitest, matching the house pattern in `no-array-reduce.test.ts`.
 *
 * What this proves:
 * - Plugin wiring: `index.ts` exposes `rules['prefer-early-return']` pointing
 *   at the same rule object exported from the rule module.
 * - `valid`: ternaries in argument/property position, ternaries assigned to
 *   a variable that is NOT immediately returned, ternaries in nested
 *   expressions, arrow function expression bodies, and — since the paired
 *   fix for #1714 — every *single-line* ternary returned directly or
 *   assigned-then-returned (the readable sort comparator
 *   `return a < b ? -1 : 1;` must NOT fire).
 * - `invalid`: only multi-line ternaries returned directly or
 *   assigned-then-returned — the complex form that justifies a guard clause.
 *
 * Paired correction for #1714: the valid array carries the single-line
 * comparator (was a false positive) and the invalid array carries the
 * multi-line ternary (still red). A rule that cries wolf on readable
 * single-line ternaries gets disabled everywhere; this pair pins the
 * boundary.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { preferEarlyReturn } from './prefer-early-return.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'prefer-early-return';

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], preferEarlyReturn);
	});
});

// -- RuleTester cases ---------------------------------------------------------
// Cases use TypeScript syntax (`declare`, `as`), so every snippet is linted
// as a `.ts` file.
const v = (code: string) => ({ code, filename: 'file.ts' });
const i = (code: string) => ({
	code,
	filename: 'file.ts',
	errors: [{ messageId: 'preferEarlyReturn' }],
});

const ruleTester = new RuleTester();

const runCases = (rule: typeof preferEarlyReturn, label: string) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// Ternary as a call argument — out of scope.
				v('declare function log(v: unknown): void;\nlog(cond ? a : b);'),
				// Ternary as an array element — out of scope.
				v('const arr = [cond ? a : b, c];'),
				// Ternary as an object property value — out of scope.
				v('const obj = { key: cond ? a : b };'),
				// Ternary assigned to a variable that is NOT immediately returned.
				v(
					'function f() {\nconst x = cond ? a : b;\nconsole.log(x);\nreturn x;\n}',
				),
				// Ternary assigned, then a different variable returned.
				v('function f() {\nconst x = cond ? a : b;\nreturn y;\n}'),
				// Non-ternary initialiser immediately returned — the assign-then-return
				// shape without a ternary. Exercises the `isConditionalExpression`
				// guard inside checkBodyStatements (without this case, dropping that
				// guard leaves the suite green).
				v('function f() {\nconst x = plain;\nreturn x;\n}'),
				// Ternary assigned, then THROWN rather than returned. Exercises the
				// `nextStmt.type === 'ReturnStatement'` guard: ThrowStatement also
				// carries an `argument`, so without this case that guard can be
				// dropped with the suite still green.
				v('function f() {\nconst x = cond ? a : b;\nthrow x;\n}'),
				// Destructuring target: the assign-then-return shape is deliberately
				// out of scope when the declaration id is a pattern rather than a
				// plain identifier. Pins that contract.
				v('function f() {\nconst [x] = cond ? a : b;\nreturn x;\n}'),
				// Ternary in a default parameter — not returned.
				v('function f(x = cond ? a : b) { return x; }'),
				// Ternary in a template literal — not returned directly.
				v('function f() { return `value: ${cond ? a : b}`; }'),
				// Ternary in a nested expression (not directly returned).
				v('function f() { return (cond ? a : b) + 1; }'),
				// Arrow function with expression body — out of scope.
				v('const f = () => (cond ? a : b);'),
				// Arrow function used as a callback — out of scope.
				v('fn((x) => (x ? a : b));'),
				// Ternary inside object property value in a return — NOT a direct
				// ternary return (the return argument is an object expression).
				v(
					'function f() { return { scope: availability.staff ? "staff" : "tenant" }; }',
				),
				// Ternary inside array element in a return — NOT a direct ternary
				// return (the return argument is an array expression).
				v('function f() { return [cond ? a : b]; }'),
				// `??` nullish coalescing is NOT a ternary — out of scope.
				v('function f() { return value ?? fallback; }'),

				// ---- Paired green for #1714: single-line ternaries returned ----
				// directly or assigned-then-returned are perfectly readable and
				// must NOT fire. The rule used to flag every one of these; the
				// paired red case below keeps the complex form caught.
				// Direct return of a single-line ternary (sort-comparator shape).
				v('function f() { return cond ? a : b; }'),
				// Direct return with typed values, single line.
				v('function f(): string { return cond ? "yes" : "no"; }'),
				// Direct return with function calls, single line.
				v('function f() { return isReady ? compute() : fallback(); }'),
				// Function expression returning a single-line ternary.
				v('const f = function() { return cond ? a : b; }'),
				// Anonymous function expression assigned then returned, single line.
				v('const f = function() { const x = cond ? a : b;\nreturn x; }'),
				// Arrow function with block body returning a single-line ternary.
				v('const f = () => { return cond ? a : b; }'),
				// Arrow function with block body assigned then returned, single line.
				v('const f = () => { const x = cond ? a : b;\nreturn x; }'),
				// Single-line ternary inside an `if` block.
				v('function f() { if (cond) { return a ? b : c; } }'),
				// Single-line ternary inside an `if`/`else`.
				v('function f() { if (cond) { return; } else { return a ? b : c; } }'),
				// Single-line ternary assigned-then-returned inside an `if` block.
				v('function f() { if (cond) { const x = a ? b : c;\nreturn x; } }'),
				// Single-line ternary inside a `try` block.
				v('function f() { try { return a ? b : c; } catch { return null; } }'),
				// Single-line ternary inside a `catch` block.
				v('function f() { try { return null; } catch { return a ? b : c; } }'),
				// Single-line ternary inside a `finally` block.
				v(
					'function f() { try { return null; } finally { return a ? b : c; } }',
				),
				// Single-line ternary inside a `for` loop.
				v(
					'function f() { for (let i = 0; i < 10; i++) { return a ? b : c; } }',
				),
				// Single-line ternary inside a `for...of` loop.
				v('function f() { for (const x of xs) { return a ? b : c; } }'),
				// Single-line ternary inside a `while` loop.
				v('function f() { while (cond) { return a ? b : c; } }'),
				// Single-line ternary inside a `case` clause.
				v(
					'function f(x) { switch (x) { case 1: return a ? b : c; default: return null; } }',
				),
				// Single-line ternary assigned-then-returned inside a `case` clause.
				v(
					'function f(x) { switch (x) { case 1: const v = a ? b : c; return v; default: return null; } }',
				),
				// Single-line ternary assigned-then-returned, preceding statement breaks adjacency.
				v(
					'function f() { declare function log(): void; log(); const v = a ? b : c; return v; }',
				),
				// Single-line ternary inside a bare block.
				v('function f() { { return a ? b : c; } }'),
				// Single-line ternary inside an `if` inside a `try`.
				v(
					'function f() { try { if (cond) { return a ? b : c; } } catch { return null; } }',
				),
				// Single-line ternary inside a `for` inside an `if`.
				v(
					'function f() { if (cond) { for (const x of xs) { return a ? b : c; } } }',
				),
			],
			invalid: [
				// ---- Paired red for #1714: multi-line ternaries must still fire ----
				// The ternary spans multiple lines — the complex form that justifies
				// a guard clause. The single-line cases above are the paired green.
				i(
					'function f() {\n' +
						'  return cond\n' +
						'    ? a\n' +
						'    : b;\n' +
						'}',
				),
				// Multi-line direct return with typed values.
				i(
					'function f(): string {\n' +
						'  return cond\n' +
						'    ? "yes"\n' +
						'    : "no";\n' +
						'}',
				),
				// Multi-line assign-then-return.
				i(
					'function f() {\n' +
						'  const x = cond\n' +
						'    ? a\n' +
						'    : b;\n' +
						'  return x;\n' +
						'}',
				),
			],
		});
	});
};

runCases(preferEarlyReturn, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
