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
 *   expressions — must NOT fire.
 * - `invalid`: `return a ? b : c;` (direct return),
 *   `const x = a ? b : c; return x;` (assigned then returned), and
 *   `() => (cond ? a : b)` (arrow with expression body) — each report with
 *   `messageId: 'preferEarlyReturn'`.
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
			],
			invalid: [
				// Direct return of a ternary.
				i('function f() { return cond ? a : b; }'),
				// Direct return with typed values.
				i('function f(): string { return cond ? "yes" : "no"; }'),
				// Arrow function with expression body returning a ternary.
				i('const f = () => (cond ? a : b);'),
				// Ternary assigned then immediately returned.
				i('function f() { const x = cond ? a : b;\nreturn x; }'),
				// Direct return of a ternary with function calls.
				i('function f() { return isReady ? compute() : fallback(); }'),
			],
		});
	});
};

runCases(preferEarlyReturn, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
