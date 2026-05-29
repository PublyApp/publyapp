/**
 * Harness test for `publy/no-direct-dayjs-in-components` (issue #350, PR JS.3,
 * tracking #498).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into Node's
 * built-in `node:test` runner, matching the existing lodash rule tests.
 *
 * What this proves:
 * - Plugin wiring: `index.js` exposes `rules['no-direct-dayjs-in-components']`
 *   pointing at the same rule object exported from the rule module.
 * - `valid`: direct dayjs imports are allowed outside React component `.tsx`
 *   paths, including the format-time utility itself, non-`.tsx` files, and
 *   `.tsx` files outside component directories/routes.
 * - `invalid`: direct `dayjs` and `dayjs/plugin/*` imports report in component
 *   `.tsx` files under shared components, route trees, `_parts`, or
 *   `_components`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { noDirectDayjsInComponents } from './no-direct-dayjs-in-components.js';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-direct-dayjs-in-components';

// -- Plugin entrypoint wiring assertion --------------------------------------
describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noDirectDayjsInComponents);
	});
});

// -- RuleTester cases ---------------------------------------------------------
const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				{
					code: "import dayjs from 'dayjs';",
					filename: 'apps/front/src/lib/format-time.ts',
				},
				{
					code: "import dayjs from 'dayjs';",
					filename: 'apps/front/src/lib/date-helper.ts',
				},
				{
					code: "import dayjs from 'dayjs';",
					filename: 'apps/front/src/pages/SomePage.tsx',
				},
				{
					code: "import dayjs from 'dayjs';",
					filename: 'packages/ui/src/_components/date-label.tsx',
				},
				{
					code: "import { formatDate } from '@/lib/format-time';",
					filename: 'apps/front/src/components/date-label.tsx',
				},
			],
			invalid: [
				{
					code: "import dayjs from 'dayjs';",
					filename: 'apps/front/src/components/date-label.tsx',
					errors: [{ messageId: 'directDayjsImport' }],
				},
				{
					code: "import utc from 'dayjs/plugin/utc';",
					filename: 'apps/front/src/routes/staff/users/page.tsx',
					errors: [{ messageId: 'directDayjsImport' }],
				},
				{
					code: "import fr from 'dayjs/locale/fr';",
					filename: 'apps/front/src/components/date-label.tsx',
					errors: [{ messageId: 'directDayjsImport' }],
				},
				{
					code: "import { isDayjs } from 'dayjs';",
					filename: 'apps/front/src/routes/staff/users/page.tsx',
					errors: [{ messageId: 'directDayjsImport' }],
				},
				{
					code: "import * as dayjs from 'dayjs';",
					filename: 'apps/front/src/_parts/date-range-picker.tsx',
					errors: [{ messageId: 'directDayjsImport' }],
				},
				{
					code: "import dayjs from 'dayjs';",
					filename: 'apps/front/src/routes/some-page/_components/MyWidget.tsx',
					errors: [{ messageId: 'directDayjsImport' }],
				},
			],
		});
	});
};

runCases(noDirectDayjsInComponents, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
