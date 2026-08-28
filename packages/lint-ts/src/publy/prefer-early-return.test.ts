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
 *   expressions, arrow function expression bodies — must NOT fire.
 * - `invalid`: `return a ? b : c;` (direct return),
 *   `const x = a ? b : c; return x;` (assigned then returned),
 *   `() => { return cond ? a : b; }` (arrow with block body returning ternary),
 *   and `() => { const x = cond ? a : b; return x; }` (arrow with block body assigned then returned) — each report with
 *   `messageId: 'preferEarlyReturn'`.
 *
 * Nesting coverage (r2 fix): the visitor reaches every `ReturnStatement` and
 * `BlockStatement` at any depth, so ternary-returns nested inside `if`/`else`,
 * `try`/`catch`/`finally`, `for`, `for...of`, `while`, `switch`/`case`, bare
 * blocks, and multi-level nesting are all detected. This suite proves it with
 * an `invalid` case for every nesting form — each would pass if the rule only
 * descended one level.
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
				v('const x = cond ? a : b;\nconsole.log(x);\nreturn x;'),
				// Ternary assigned, then a different variable returned.
				v('const x = cond ? a : b;\nreturn y;'),
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
			],
			invalid: [
				// ---- Top-level (already covered in r1) -------------------------
				// Direct return of a ternary.
				i('function f() { return cond ? a : b; }'),
				// Direct return with typed values.
				i('function f(): string { return cond ? "yes" : "no"; }'),
				// Ternary assigned then immediately returned.
				i('function f() { const x = cond ? a : b;\nreturn x; }'),
				// Direct return of a ternary with function calls.
				i('function f() { return isReady ? compute() : fallback(); }'),
				// Function expression returning a ternary.
				i('const f = function() { return cond ? a : b; }'),
				// Anonymous function expression assigned then returned.
				i('const f = function() { const x = cond ? a : b;\nreturn x; }'),
				// Arrow function with block body returning a ternary.
				i('const f = () => { return cond ? a : b; }'),
				// Arrow function with block body assigned then returned.
				i('const f = () => { const x = cond ? a : b;\nreturn x; }'),

				// ---- Nesting: if / else --------------------------------------
				// Ternary returned inside an `if` block.
				i('function f() { if (cond) { return a ? b : c; } }'),
				// Ternary returned inside an `else` block.
				i('function f() { if (cond) { return; } else { return a ? b : c; } }'),
				// Ternary assigned-then-returned inside an `if` block.
				i('function f() { if (cond) { const x = a ? b : c;\nreturn x; } }'),

				// ---- Nesting: try / catch / finally ---------------------------
				// Ternary returned inside a `try` block.
				i('function f() { try { return a ? b : c; } catch { return null; } }'),
				// Ternary returned inside a `catch` block.
				i('function f() { try { return null; } catch { return a ? b : c; } }'),
				// Ternary returned inside a `finally` block.
				i(
					'function f() { try { return null; } finally { return a ? b : c; } }',
				),

				// ---- Nesting: loops -------------------------------------------
				// Ternary returned inside a `for` loop.
				i(
					'function f() { for (let i = 0; i < 10; i++) { return a ? b : c; } }',
				),
				// Ternary returned inside a `for...of` loop.
				i('function f() { for (const x of xs) { return a ? b : c; } }'),
				// Ternary returned inside a `while` loop.
				i('function f() { while (cond) { return a ? b : c; } }'),

				// ---- Nesting: switch / case -----------------------------------
				// Ternary returned inside a `case` clause.
				i(
					'function f(x) { switch (x) { case 1: return a ? b : c; default: return null; } }',
				),
				// Ternary assigned-then-returned inside a `case` clause (Case 2).
				// The `SwitchCase` visitor is the ONLY mechanism that catches this
				// pattern, since `SwitchCase.consequent` is not a `BlockStatement`.
				i(
					'function f(x) { switch (x) { case 1: const v = a ? b : c; return v; default: return null; } }',
				),

				// ---- Nesting: bare block --------------------------------------
				// Ternary returned inside a bare block.
				i('function f() { { return a ? b : c; } }'),

				// ---- Two-level nesting ----------------------------------------
				// Ternary returned inside an `if` inside a `try`.
				i(
					'function f() { try { if (cond) { return a ? b : c; } } catch { return null; } }',
				),
				// Ternary returned inside a `for` inside an `if`.
				i(
					'function f() { if (cond) { for (const x of xs) { return a ? b : c; } } }',
				),
			],
		});
	});
};

runCases(preferEarlyReturn, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
