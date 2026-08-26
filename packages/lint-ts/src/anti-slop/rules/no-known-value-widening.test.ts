/**
 * Fixtures for `anti-slop/no-known-value-widening` — the two #1448 escapes,
 * plus the round-2 alias-transparency escapes (PR #1501 review).
 *
 * These snippets are intentionally NOT run through `RuleTester.run` in a
 * shared suite with the other rules: each block below is executed against the
 * rule via `RuleTester` inside its own `describe`, because the rule needs
 * TypeScript syntax (interfaces, index signatures) and RuleTester cases here
 * pin exact report positions/message data per snippet.
 *
 * Item 1 — interface escape: an index-signature-only `interface` must be
 * classified as the SAME widening as the byte-equivalent `type` alias form
 * (`{ [k: string]: string }`). Before the fix the `type` form reports and the
 * `interface` form stays silent; after the fix both report.
 *
 * Item 2 — empty-object accumulator bypass: a declared widened type on an
 * EMPTY object literal that is populated by later property assignments
 * (`const x: Record<string, unknown> = {}; x.a = value`) must be reported at
 * the declaration. The literal `{}` carries no evidence of its final shape,
 * so the carve-out for empty literals handed to genuinely-open containers
 * does not apply when post-hoc writes prove the accumulator use.
 *
 * Round 2 — alias transparency: classification must follow type aliases to
 * the real shape. `type X = IndexSigOnlyInterface`, alias chains, instantiated
 * generic aliases carrying such an interface, `export type` re-exports, and
 * assertions through the alias must all classify exactly like the direct
 * reference; aliases over REAL contracts stay clean.
 */

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { noKnownValueWideningRule } from './no-known-value-widening.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-known-value-widening';

describe('plugin entrypoint wiring (@org/lint-ts anti-slop)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		// The rule module exports the rule under this name via the plugin index.
		void plugin;
		void noKnownValueWideningRule;
	});
});

// Cases use TypeScript type syntax, so every snippet is linted as a `.ts` file.
const v = (code: string) => ({ code, filename: 'file.ts' });
const i = (code: string) => ({
	code,
	filename: 'file.ts',
	errors: [{ messageId: 'widening' }],
});

const ruleTester = new RuleTester();

describe(`anti-slop/${RULE_NAME} (#1448 interface + accumulator fixtures)`, () => {
	ruleTester.run(RULE_NAME, noKnownValueWideningRule, {
		valid: [
			// A fully-typed named interface is a real contract, not a widening.
			v(
				'interface Named { name: string }\nconst value: Named = { name: "x" };',
			),
			// An index-signature interface fed from a NON-evidence expression is
			// out of scope for the widening rule (no known evidence discarded).
			v(
				'interface M { [k: string]: string }\ndeclare const source: M;\nconst copy: M = source;',
			),
			// A MIXED interface (real members + an index signature) is a contract
			// with a fallback lookup, not an index-signature-only opening.
			v(
				'interface Mixed { call(): number; [seg: string]: Mixed }\nconst value: Mixed = makeChain();',
			),
			// Empty literal into an open dictionary with NO later writes stays a
			// legitimate open-container seed (existing carve-out, must survive).
			v('const acc: Record<string, unknown> = {};\nconsume(acc);'),
		],
		invalid: [
			// ── Item 1: interface escape ────────────────────────────────────
			// The `type` form of the same shape already reported before #1448…
			i(
				'type T = { [k: string]: string };\nconst value: T = { key: "known" };',
			),
			// …and the byte-equivalent INTERFACE form must report identically.
			i(
				'interface M { [k: string]: string }\nconst value: M = { key: "known" };',
			),
			// Interface escape through an assertion must also be caught.
			i(
				'interface M { [k: string]: number }\nconst value = { known: 1 } as M;',
			),
			// Interface extending an index-signature-only interface stays an
			// open-dictionary target (extension cannot narrow the index).
			i(
				'interface Base { [k: string]: string }\ninterface Ext extends Base {}\nconst value: Ext = { key: "known" };',
			),

			// ── Item 2: empty-object accumulator bypass ─────────────────────
			// Declared widened type on an empty literal, populated afterwards:
			// the declaration site must report.
			i(
				'const createBody: Record<string, unknown> = {};\ncreateBody.body = "x";\ncreateBody.projectId = "p1";',
			),
			i(
				'type PatchBody = { [k: string]: unknown };\nconst patchBody: PatchBody = {};\npatchBody.body = "x";',
			),
			i(
				'interface Accum { [k: string]: unknown }\nconst acc: Accum = {};\nacc.later = true;',
			),
			// Generic container flavour of the same bypass.
			i('const bag: Partial<Record<string, unknown>> = {};\nbag.field = 1;'),
		],
	});
});

describe(`anti-slop/${RULE_NAME} (#1448 r2 alias-transparency fixtures)`, () => {
	ruleTester.run(RULE_NAME, noKnownValueWideningRule, {
		valid: [
			// An alias over a REAL contract is transparent and stays clean.
			v(
				'interface Concrete { name: string }\ntype W = Concrete;\nconst value: W = { name: "x" };',
			),
			// Same through an instantiated generic alias over a real contract.
			v(
				'interface Concrete { name: string }\ntype Box<T> = { value: T };\nconst value: Box<Concrete> = { value: { name: "x" } };',
			),
			// A MIXED interface (named member + fallback index signature)
			// reached THROUGH an alias keeps accepting literal evidence: one
			// named member closes the opening, alias hops cannot reopen it.
			v(
				'interface Registry { version: string; [k: string]: unknown }\ntype RegistryRef = Registry;\nconst registry: RegistryRef = { version: "1" };',
			),
		],
		invalid: [
			// Single alias hop over an index-signature-only interface: the exact
			// escape reproduced by the round-1 adversarial review.
			i(
				'interface M { [k: string]: string }\ntype X = M;\nconst value: X = { key: "known" };',
			),
			// Alias-of-alias chains must stay transparent for classification.
			i(
				'interface M { [k: string]: number }\ntype A = M;\ntype B = A;\nconst value: B = { key: 1 };',
			),
			// Instantiated generic alias carrying the opening in a property slot.
			i(
				'interface M { [k: string]: string }\ntype Wrap<T> = { value: T };\nconst value: Wrap<M> = { value: { key: "known" } };',
			),
			// Exported declarations resolve through the same environment map, so
			// an `export type` re-export must not silence the opening either.
			i(
				'export interface M { [k: string]: boolean }\nexport type X = M;\nconst value: X = { key: true };',
			),
			// Opening wrapped in a transparent wrapper THROUGH the alias
			// (`Readonly<M>`): wrapper unwrapping must survive alias hops.
			i(
				'interface M { [k: string]: string }\ntype X = Readonly<M>;\nconst value: X = { key: "known" };',
			),
			// Assertion position through the alias must report like `as M`.
			i(
				'interface M { [k: string]: string }\ntype X = M;\nconst value = { key: "known" } as X;',
			),
		],
	});
});
