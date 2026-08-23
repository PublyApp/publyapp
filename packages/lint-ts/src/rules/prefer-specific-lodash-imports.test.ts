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
 * - `valid`: sub-path lodash imports, look-alike package names (exact-string
 *   match means `lodash-es` / `lodashy` / `@company/lodash` must NOT flag), and
 *   non-lodash imports report nothing.
 * - `invalid`: full-package lodash imports (default / named / namespace / mixed /
 *   side-effect) all report, with the auto-fixed output asserted for the
 *   unambiguous value-only named-import case (including aliases). Type-only
 *   members (`import { type Dictionary }` / `import type { … }`) are reported but
 *   NOT auto-fixed, because lodash type members have no `lodash/<Type>` subpath.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { preferSpecificLodashImports } from './prefer-specific-lodash-imports.ts';

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
				// Lookalike / sibling package names must not be flagged — the rule
				// matches the source string exactly against 'lodash'.
				"import lodashes from 'lodashes';",
				"import { thing } from 'not-lodash';",
				"import x from 'lodash-es';",
				"import x from 'lodashy';",
				"import x from '@company/lodash';",
				// Out of scope: re-export (ExportNamedDeclaration) is not an
				// ImportDeclaration, so this rule never visits it.
				"export { map } from 'lodash';",
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
					code: "import { set } from 'lodash';\nset({}, 'a.b', 1);",
					filename: 'file.ts',
					errors: [{ messageId: 'named' }],
					output: "import set from 'lodash/set';\nset({}, 'a.b', 1);",
				},
				{
					code: "import { set } from 'lodash';\nset({}, 'a.b', 1);",
					filename: 'file.mjs',
					errors: [{ messageId: 'named' }],
					output: "import set from 'lodash/set.js';\nset({}, 'a.b', 1);",
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
				// Per-specifier `type` modifier — reported but NOT auto-fixed, because
				// `lodash/Dictionary` is not a real helper module. `output` omitted
				// (RuleTester treats a missing `output` as "no fix expected").
				{
					code: "import { type Dictionary } from 'lodash';",
					filename: 'file.ts',
					errors: [{ messageId: 'named' }],
				},
				// Declaration-level `import type` — reported, NOT auto-fixed.
				{
					code: "import type { Dictionary } from 'lodash';",
					filename: 'file.ts',
					errors: [{ messageId: 'named' }],
				},
				{
					code: "import type { Dictionary, List } from 'lodash';",
					filename: 'file.ts',
					errors: [{ messageId: 'named' }],
				},
				// Mixed value + type-only specifiers — a partial fix could emit broken
				// code (`lodash/PartialObject` does not exist), so report, NO fix.
				{
					code: "import { type PartialObject, map } from 'lodash';",
					filename: 'file.ts',
					errors: [{ messageId: 'named' }],
				},
			],
		});
	});
};

runCases(preferSpecificLodashImports, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
