/**
 * Spec for `publy/no-never-any-casts` (issue #1337 — candidate anti-slop
 * rung forbidding single assertions to `never`/`any`).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * vitest, matching the house pattern in `no-iife.test.ts`.
 *
 * What this proves:
 * - Plugin wiring: `index.ts` exposes `rules['no-never-any-casts']` pointing
 *   at the same rule object exported from the rule module.
 * - `valid`: casts to concrete types, `as const`, parenthesized non-keyword
 *   types (`as (string | number)`), and casts to `unknown` — must NOT fire.
 *   Since #1346 the same holds for `satisfies` against concrete types and
 *   against an ALIAS whose definition mentions `never` — the ban is
 *   syntactic on the keyword, so a matcher that only hunts the literal word
 *   `never` is defeated by the alias fixture.
 * - `invalid`: single `x as never`, `x as any`, angle-bracket `<never>x` /
 *   `<any>x`, parenthesized keyword annotations (`x as (never)`,
 *   `x as (any)`), and — since #1346 — `x satisfies never`, `x satisfies
 *   any`, including the parenthesized form and links inside mixed chains
 *   (`x as any satisfies never`) — each reports with
 *   `messageId: 'noNeverAnyCast'` and the right `keyword` data. Chained links landing on the keywords still
 *   report here, ONCE PER LINK, ordered outermost first (`value as any as
 *   never` → `['never', 'any']`; chain overlap with rung 5 is by design,
 *   see rule header).
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { noNeverAnyCasts } from './no-never-any-casts.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-never-any-casts';

// -- Plugin entrypoint wiring assertion ---------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noNeverAnyCasts);
	});
});

// -- RuleTester cases ---------------------------------------------------------
// Cases use TypeScript assertion syntax, so every snippet is linted as a
// `.ts` file.
const v = (code) => ({ code, filename: 'file.ts' });
// Single-keyword cases pass one keyword; chain cases pass one entry PER
// REPORTED LINK, outermost first (pre-order visit order).
const i = (code, keywords) => ({
	code,
	filename: 'file.ts',
	errors: (Array.isArray(keywords) ? keywords : [keywords]).map((keyword) => ({
		messageId: 'noNeverAnyCast',
		data: { keyword },
	})),
});

const ruleTester = new RuleTester();

describe(`publy/${RULE_NAME}`, () => {
	ruleTester.run(RULE_NAME, noNeverAnyCasts, {
		valid: [
			// Cast to a concrete type — normal narrowing, not an escape hatch.
			v(
				'declare const input: string;\nconst n = JSON.parse(input) as { id: string };',
			),
			// `as const` — precision-preserving, allowed everywhere already.
			v('const value = { mode: "on" } as const;'),
			// Parenthesized union annotation — not a bare keyword.
			v('declare const x: string;\nconst y = x as (string | number);'),
			// `as unknown` — shape-agnostic plumbing keeps type evidence flowing;
			// this is exactly what the #1337 stub fix uses instead of `as never`.
			v(
				'declare const input: { data: unknown };\nconst fn = (data: unknown): unknown => data;\nfn(input.data);',
			),
			// Type annotations carrying never/any are NOT assertions.
			v(
				'function handle(data: never): void {}\nfunction log(value: any): void {}',
			),
			// Generic type argument carrying never — not an assertion either.
			v('const pair: Array<never> = [];'),
			// Alias to never — the ban is SYNTACTIC on the keyword; resolving
			// aliases would need type information this rule deliberately avoids.
			v(
				'type NeverAlias = never;\ndeclare const value: string;\nconst aliased = value as NeverAlias;',
			),
			// `satisfies` against a concrete type — a static CHECK that keeps
			// narrowing the expression; not an evidence-discarding cast (#1346).
			v(
				'declare const route: { path: string };\nconst home = { path: "/" } satisfies { path: string };',
			),
			// Alias to never under `satisfies` — same syntactic-keyword boundary
			// as the `as NeverAlias` case above. This fixture DEFEATS a mutated
			// rule that matches the word `never` textually instead of the
			// `TSNeverKeyword` node.
			v(
				'type NeverAlias = never;\ndeclare const value: string;\nconst checked = value satisfies NeverAlias;',
			),
		],
		invalid: [
			// The #1337 shapes — single `as never` on a payload argument.
			i(
				'declare const validatorFn: (data: never) => unknown;\ndeclare const input: { data: unknown };\nvalidatorFn(input.data as never);',
				'never',
			),
			// Single `as any`.
			i('declare const value: string;\nconst loose = value as any;', 'any'),
			// Angle-bracket forms.
			i('declare const value: string;\nconst tight = <never>value;', 'never'),
			i('declare const value: string;\nconst loose2 = <any>value;', 'any'),
			// Parenthesized keyword annotations peel to the bare keyword.
			i('declare const value: string;\nconst p1 = value as (never);', 'never'),
			i('declare const value: string;\nconst p2 = value as (any);', 'any'),
			// Chain links landing on the keywords report too — one report PER
			// LINK, outermost link first (`value as any as never` has two
			// keyword links; rung 5 owns the chain shape itself, this rule bans
			// the keyword at any depth).
			i(
				'declare const value: string;\nconst chained = value as any as never;',
				['never', 'any'],
			),
			i(
				'declare const value2: string;\nconst chained2 = value2 as any as never;',
				['never', 'any'],
			),
			// `satisfies never` / `satisfies any` used to evade the ban entirely
			// (#1346) — the operator discards type evidence exactly like `as`
			// when its annotation lands on a bare keyword.
			i(
				'declare const validatorFn: (data: never) => unknown;\ndeclare const input: { data: unknown };\nvalidatorFn(input.data satisfies never);',
				'never',
			),
			i(
				'declare const value: string;\nconst loose3 = value satisfies any;',
				'any',
			),
			// Parenthesized keyword annotation under `satisfies` peels too.
			i(
				'declare const value: string;\nconst p3 = value satisfies (never);',
				'never',
			),
			// Mixed chain — an `as any` link feeding `satisfies never`: one
			// report PER LINK, outermost first (the satisfies node is visited
			// before its child assertion).
			i(
				'declare const value: string;\nconst mixed = value as any satisfies never;',
				['never', 'any'],
			),
		],
	});
});
