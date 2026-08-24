/**
 * Spec for `publy/no-iife` (issue #1303 — port of the DigitalPrevention
 * rule).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * vitest, matching the house pattern in `no-array-reduce.test.ts`.
 *
 * What this proves:
 * - Plugin wiring: `index.ts` exposes `rules['no-iife']` pointing at the same
 *   rule object exported from the rule module.
 * - `valid`: plain calls, callbacks passed as arguments, constructor calls on
 *   identifiers, callee wrappers that peel to a non-function-literal
 *   (including the comma-operator form `(0, fn)()`), and identifier tags on
 *   tagged templates — must NOT fire.
 * - `invalid`: plain, async, parenthesised, `as`-cast, `satisfies`,
 *   non-null-`!`, `<type>`-assertion, comma-operator `(0, fn)()`, and
 *   tagged-template-tag IIFEs, plus `new` with a function literal callee —
 *   each report with `messageId: 'noIife'`.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { noIife } from './no-iife.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-iife';

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noIife);
	});
});

// -- RuleTester cases ---------------------------------------------------------
// Cases use TypeScript syntax (`declare`, `as`, `satisfies`, `!`, `<T>`
// assertions), so every snippet is linted as a `.ts` file.
const v = (code) => ({ code, filename: 'file.ts' });
const i = (code) => ({
	code,
	filename: 'file.ts',
	errors: [{ messageId: 'noIife' }],
});

const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// Plain call to a named function — the whole point of the fix.
				v('function boot() { return 1; }\nboot();'),
				// Method call.
				v('const obj = { method() { return 1; } };\nobj.method();'),
				// Callbacks passed as arguments are NOT immediate invocations.
				v('const arr = [1, 2, 3];\narr.map((x) => x + 1);'),
				v(
					'declare function useEffect(fn: () => void, deps: unknown[]): void;\nuseEffect(() => {}, []);',
				),
				// Arrow assigned then called elsewhere.
				v('const fn = () => 1;\nfn();'),
				// Function returned from a factory then called.
				v('const make = () => () => 1;\nconst inner = make();\ninner();'),
				// Callee wrapper peels to an identifier — not a function literal.
				v('declare const fn: () => void;\n(fn as () => void)();'),
				v('declare const fn2: () => void;\n(<() => void>fn2)();'),
				// Comma-operator callee whose LAST expression is an identifier —
				// not a function literal.
				v('declare const fn3: () => void;\n(0, fn3)();'),
				// Identifier tag — a normal tagged template, not an immediate
				// invocation.
				v(
					'declare const css: (strings: TemplateStringsArray) => string;\ncss`color: red;`;',
				),
				// `new Identifier()` is a normal construction, not an IIFE.
				v('class Foo {}\nnew Foo();'),
				v(
					'declare const Ctor: new () => object;\nnew (Ctor as new () => object)();',
				),
				// Regular function expression stored, not immediately invoked.
				v('const stored = function helper() { return 1; };'),
				// A named function declaration whose body contains a call is fine.
				v(
					'function outer() { return inner(); }\ndeclare function inner(): number;',
				),
			],
			invalid: [
				// Plain arrow IIFE.
				i('(() => { return 1; })();'),
				// Plain function-expression IIFE.
				i('(function () { return 1; })();'),
				// Async IIFE.
				i('(async () => { await Promise.resolve(); })();'),
				// Inner-call form: `(function () {}())`.
				i('(function () { return 1; }());'),
				// Assigned result.
				i('const x = (() => { if (true) return 1; return 2; })();'),
				// Parenthesised callee beyond the mandatory grouping.
				i('(((() => { return 1; })))();'),
				// `as`-cast callee.
				i('((() => { return 1; }) as () => number)();'),
				// `satisfies` callee.
				i('(() => ({ ready: true }))() satisfies { ready: boolean };'),
				// Non-null `!` callee.
				i('const y = (() => 1)!();'),
				// Angle-bracket type assertion callee.
				i('(<() => number>(() => 1))();'),
				// `new` on a function-literal callee.
				i('new (function () { this.x = 1; })();'),
				i('new (() => {})();'),
				// Comma-operator callee `(0, fn)()` — the effective callee is the
				// LAST expression in the sequence.
				i('(0, (() => { return 1; }))();'),
				i('(0, function () { return 1; })();'),
				// Nested sequence still ends on the function literal.
				i('(1, 2, () => 42)();'),
				// Function literal used as a tagged-template tag.
				i('const t = ((x) => String(x))`tagged`;'),
				i('(function () { return 1; })`tagged`;'),
				// Wrapped function literal behind a comma-operator callee.
				i('(0, (() => 7) as () => number)();'),
				// IIFE passed as an argument to another call.
				i('declare function log(v: unknown): void;\nlog((() => 42)());'),
			],
		});
	});
};

runCases(noIife, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
