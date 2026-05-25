/**
 * Harness test for `publy/prefer-specific-lodash-imports` (issue #350, PR JS.2,
 * tracking #462).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into Node's
 * built-in `node:test` runner — same approach as `no-op.test.js`, no extra deps.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes `rules['prefer-specific-lodash-imports']`
 *   pointing at the same rule object exported from the rule module.
 * - `valid`: sub-path lodash imports and non-lodash imports report nothing.
 * - `invalid`: full-package lodash imports (default / named / namespace / mixed /
 *   side-effect) all report, with the auto-fixed output asserted for the
 *   unambiguous named-import case (including aliases and `type` modifiers).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { preferSpecificLodashImports } from './prefer-specific-lodash-imports.js';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'prefer-specific-lodash-imports';

// ── Plugin entrypoint wiring assertion ──────────────────────────────────────
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], preferSpecificLodashImports);
	});
});

// ── RuleTester cases ────────────────────────────────────────────────────────
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				// Targeted sub-path imports are exactly what we want.
				"import map from 'lodash/map';",
				"import isEqual from 'lodash/isEqual';",
				"import { isPlainObject } from 'lodash/fp';",
				"import capitalize from 'lodash/capitalize';",
				// Lookalike package names must not be flagged.
				"import lodashes from 'lodashes';",
				"import { thing } from 'not-lodash';",
				// Unrelated imports.
				"import { useState } from 'react';",
				"import dayjs from 'dayjs';",
			],
			invalid: [
				// Default import — message only (no inferable sub-paths).
				{
					code: "import _ from 'lodash';",
					errors: [{ messageId: 'whole' }],
				},
				// Namespace import — message only.
				{
					code: "import * as _ from 'lodash';",
					errors: [{ messageId: 'whole' }],
				},
				// Side-effect-only import — message only.
				{
					code: "import 'lodash';",
					errors: [{ messageId: 'whole' }],
				},
				// Mixed default + named — message only.
				{
					code: "import _, { map } from 'lodash';",
					errors: [{ messageId: 'whole' }],
				},
				// Named imports — auto-fixable into per-helper sub-path imports.
				{
					code: "import { map } from 'lodash';",
					errors: [{ messageId: 'named' }],
					output: "import map from 'lodash/map';",
				},
				{
					code: "import { map, trim } from 'lodash';",
					errors: [{ messageId: 'named' }],
					output:
						"import map from 'lodash/map';\nimport trim from 'lodash/trim';",
				},
				// Aliased named import — local name preserved, sub-path uses imported name.
				{
					code: "import { map as mapValues } from 'lodash';",
					errors: [{ messageId: 'named' }],
					output: "import mapValues from 'lodash/map';",
				},
				// Per-specifier `type` modifier is preserved (needs the TS parser).
				{
					code: "import { type Dictionary } from 'lodash';",
					filename: 'file.ts',
					errors: [{ messageId: 'named' }],
					output: "import type Dictionary from 'lodash/Dictionary';",
				},
				// Declaration-level `import type` is preserved across all members.
				{
					code: "import type { Dictionary, List } from 'lodash';",
					filename: 'file.ts',
					errors: [{ messageId: 'named' }],
					output:
						"import type Dictionary from 'lodash/Dictionary';\nimport type List from 'lodash/List';",
				},
			],
		});
	});
};

runCases(preferSpecificLodashImports, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
