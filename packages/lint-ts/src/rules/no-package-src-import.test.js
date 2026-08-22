/**
 * Harness test for `publy/no-package-src-import` (issue #1200).
 *
 * Proves:
 * - Plugin entrypoint wiring: `index.js` exports the rule.
 * - `valid`: normal imports through the exports map are accepted.
 * - `invalid`: `@org/client-ts/src/…` and `@org/shared-ts/src/…` are rejected.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { noPackageSrcImport } from './no-package-src-import.js';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-package-src-import';

describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noPackageSrcImport);
	});
});

const ruleTester = new RuleTester();

describe(`publy/${RULE_NAME} (via direct import)`, () => {
	ruleTester.run(RULE_NAME, noPackageSrcImport, {
		valid: [
			// Correct exports-map imports are fine.
			{
				code: "import { ApiClient } from '@org/client-ts/apiClient';",
				filename: 'apps/front/src/lib/query/auth.ts',
			},
			{
				code: "import { Foo } from '@org/client-ts/models/index';",
				filename: 'apps/front/src/routes/page.tsx',
			},
			{
				code: "import { Bar } from '@org/shared-ts/lib/utils';",
				filename: 'apps/front/src/lib/helper.ts',
			},
			// Inside the packages themselves is allowed (own src).
			{
				code: "import { X } from '../other';",
				filename: 'packages/client-ts/src/models/index.ts',
			},
			{
				code: "import { Y } from './foo';",
				filename: 'packages/shared-ts/src/lib/utils.ts',
			},
			// Non-consumer files (e.g. docs, config) are ignored.
			{
				code: "import { Z } from '@org/client-ts/src/old';",
				filename: 'docs/guides/architecture.md',
			},
		],
		invalid: [
			{
				code: "import { ApiClient } from '@org/client-ts/src/apiClient';",
				filename: 'apps/front/src/lib/query/auth.ts',
				errors: [{ messageId: 'banned' }],
			},
			{
				code: "import { Foo } from '@org/client-ts/src/models/index.js';",
				filename: 'apps/front/src/routes/page.tsx',
				errors: [{ messageId: 'banned' }],
			},
			{
				code: "import { StaffGetResponse } from '@org/client-ts/src/staff/permissions/scopes/staff/index.js';",
				filename: 'apps/front/src/lib/query/staff-profiles.ts',
				errors: [{ messageId: 'banned' }],
			},
			{
				code: "import { TenantGetResponse } from '@org/client-ts/src/staff/permissions/scopes/tenant/index.js';",
				filename: 'apps/front/src/lib/query/staff-tenant-profiles.ts',
				errors: [{ messageId: 'banned' }],
			},
			{
				code: "import { Bar } from '@org/shared-ts/src/lib/logger';",
				filename: 'packages/lint-ts/src/rules/example.js',
				errors: [{ messageId: 'banned' }],
			},
			{
				code: "import { baz } from '@org/shared-ts/src/something';",
				filename: 'apps/front/src/components/widget.tsx',
				errors: [{ messageId: 'banned' }],
			},
		],
	});
});

describe(`publy/${RULE_NAME} (via plugin index export)`, () => {
	ruleTester.run(RULE_NAME, plugin.rules[RULE_NAME], {
		valid: [
			{
				code: "import { ApiClient } from '@org/client-ts/apiClient';",
				filename: 'apps/front/src/lib/query/auth.ts',
			},
		],
		invalid: [
			{
				code: "import { ApiClient } from '@org/client-ts/src/apiClient';",
				filename: 'apps/front/src/lib/query/auth.ts',
				errors: [{ messageId: 'banned' }],
			},
		],
	});
});
