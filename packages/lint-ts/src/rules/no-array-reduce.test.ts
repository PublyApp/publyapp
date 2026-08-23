/**
 * Harness test for `publy/no-array-reduce` (AGENTS.md → "No Array.reduce()").
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * Node's built-in `node:test` runner, matching the existing rule test style.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes `rules['no-array-reduce']` pointing at
 *   the same rule object exported from the rule module.
 * - `valid`: preferred alternatives (`find`, `filter+map`, `for...of`,
 *   `Object.groupBy`) and edge cases that must NOT fire.
 * - `invalid`: `arr.reduce(...)` / `arr.reduceRight(...)` calls — including
 *   optional-chaining and computed string-literal (`arr['reduce']`) forms —
 *   each report with `messageId: 'noReduce'`.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { noArrayReduce } from './no-array-reduce.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-array-reduce';

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noArrayReduce);
	});
});

// -- RuleTester cases ---------------------------------------------------------
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// Preferred alternatives — must NOT flag.
				'const found = arr.find((x) => x.id === id);',
				'const names = arr.filter((x) => x.active).map((x) => x.name);',
				'const grouped = Object.groupBy(arr, (x) => x.category);',
				// for...of is a statement, not a call — never visits CallExpression.
				'for (const item of arr) { total += item.value; }',
				// A method literally named reduce on an object literal that is NOT
				// called — not a CallExpression, so should not flag.
				'const obj = { reduce: 42 };',
				// Dynamic computed key — method name is not statically known.
				'arr[method]((a, b) => a + b, 0);',
				// Computed string-literal key that is not reduce/reduceRight.
				"arr['reduceX']((a, b) => a + b, 0);",
				// Unrelated method calls.
				'arr.map((x) => x * 2);',
				'arr.filter((x) => x > 0);',
				'arr.forEach((x) => console.log(x));',
				'arr.find((x) => x.id === 1);',
				'arr.some((x) => x > 0);',
				'arr.every((x) => x > 0);',
				'arr.flat();',
				'arr.flatMap((x) => [x, x]);',
				// reduceRight spelled differently (case mismatch) — not flagged.
				'arr.ReduceRight((a, b) => a + b, 0);',
			],
			invalid: [
				// Basic reduce call.
				{
					code: 'const sum = arr.reduce((acc, x) => acc + x, 0);',
					errors: [{ messageId: 'noReduce' }],
				},
				// reduceRight call.
				{
					code: 'const result = items.reduceRight((acc, x) => [...acc, x], []);',
					errors: [{ messageId: 'noReduce' }],
				},
				// reduce with no initial value.
				{
					code: 'const max = arr.reduce((a, b) => (a > b ? a : b));',
					errors: [{ messageId: 'noReduce' }],
				},
				// Chained call — the .reduce() itself is still flagged.
				{
					code: 'const val = getData().filter((x) => x > 0).reduce((a, b) => a + b, 0);',
					errors: [{ messageId: 'noReduce' }],
				},
				// Object accumulation pattern — common anti-pattern this rule targets.
				{
					code: 'const map = arr.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});',
					errors: [{ messageId: 'noReduce' }],
				},
				// TypeScript typed reduce.
				{
					code: 'const total = numbers.reduce<number>((acc, n) => acc + n, 0);',
					filename: 'file.ts',
					errors: [{ messageId: 'noReduce' }],
				},
				// Optional-chaining — `arr?.reduce(...)` is still flagged.
				{
					code: 'const sum = arr?.reduce((acc, x) => acc + x, 0);',
					errors: [{ messageId: 'noReduce' }],
				},
				// Optional-chaining reduceRight — also flagged.
				{
					code: 'const result = items?.reduceRight((acc, x) => [...acc, x], []);',
					errors: [{ messageId: 'noReduce' }],
				},
				// Computed string-literal access — bracket form is still flagged.
				{
					code: "const sum = arr['reduce']((a, b) => a + b, 0);",
					errors: [{ messageId: 'noReduce' }],
				},
				// Computed string-literal reduceRight — also flagged.
				{
					code: "const result = items['reduceRight']((acc, x) => [...acc, x], []);",
					errors: [{ messageId: 'noReduce' }],
				},
			],
		});
	});
};

runCases(noArrayReduce, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
