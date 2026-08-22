/**
 * Harness test for `publy/no-package-src-import` (issue #1200).
 *
 * Proves:
 * - Plugin entrypoint wiring: `index.ts` exports the rule.
 * - `valid`: normal imports through the exports map are accepted.
 * - `invalid`: `@org/client-ts/src/…` and `@org/shared-ts/src/…` are rejected.
 */
import assert from 'node:assert/strict';

import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from '../index.ts';
import { noPackageSrcImport } from './no-package-src-import.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-package-src-import';

describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noPackageSrcImport);
	});
});

const ruleTester = new RuleTester();

const runCases = (rule: typeof noPackageSrcImport, label: string) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
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
				// Dynamic import() with an allowed path is fine.
				{
					code: "const m = import('@org/client-ts/apiClient');",
					filename: 'apps/front/src/lib/query/auth.ts',
				},
				{
					code: "const m = import('@org/shared-ts/lib/utils');",
					filename: 'apps/front/src/routes/page.tsx',
				},
				// Dynamic import() with a variable (non-literal) is ignored.
				{
					code: 'const m = import(variable);',
					filename: 'apps/front/src/lib/query/auth.ts',
				},
				// Dynamic import() with a template literal is ignored.
				{
					code: 'const m = import(`@org/client-ts/${path}`);',
					filename: 'apps/front/src/lib/query/auth.ts',
				},
				// export … from with an allowed path is fine.
				{
					code: "export { ApiClient } from '@org/client-ts/apiClient';",
					filename: 'apps/front/src/routes/page.tsx',
				},
				{
					code: "export * from '@org/shared-ts/lib/utils';",
					filename: 'apps/front/src/routes/page.tsx',
				},
				// export * from inside own package is fine.
				{
					code: "export * from './other';",
					filename: 'packages/client-ts/src/models/index.ts',
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
				// Dynamic import() with a banned path.
				{
					code: "const m = import('@org/client-ts/src/apiClient');",
					filename: 'apps/front/src/lib/query/auth.ts',
					errors: [{ messageId: 'banned' }],
				},
				{
					code: "const m = import('@org/shared-ts/src/lib/logger');",
					filename: 'apps/front/src/components/widget.tsx',
					errors: [{ messageId: 'banned' }],
				},
				// export … from with a banned path.
				{
					code: "export { ApiClient } from '@org/client-ts/src/apiClient';",
					filename: 'apps/front/src/routes/page.tsx',
					errors: [{ messageId: 'banned' }],
				},
				{
					code: "export { foo } from '@org/shared-ts/src/lib/logger';",
					filename: 'apps/front/src/lib/helper.ts',
					errors: [{ messageId: 'banned' }],
				},
				// export * from with a banned path.
				{
					code: "export * from '@org/client-ts/src/apiClient';",
					filename: 'apps/front/src/routes/page.tsx',
					errors: [{ messageId: 'banned' }],
				},
				{
					code: "export * from '@org/shared-ts/src/something';",
					filename: 'apps/front/src/components/widget.tsx',
					errors: [{ messageId: 'banned' }],
				},
			],
		});
	});
};

runCases(noPackageSrcImport, 'via direct import');
runCases(plugin.rules[RULE_NAME] as typeof noPackageSrcImport, 'via plugin index export');
