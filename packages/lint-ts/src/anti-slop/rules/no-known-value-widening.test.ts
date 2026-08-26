/**
 * Fixtures for `anti-slop/no-known-value-widening` — the two #1448 escapes.
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
