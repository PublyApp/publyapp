/**
 * Harness test for `publy/no-console-in-source` (issue #350, PR JS.4,
 * tracking #499).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { noConsoleInSource } from './no-console-in-source.js';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-console-in-source';
const LOGGER_IMPORT =
	"import { logger } from '@org/shared-ts/lib/logger/iso-logger';";

describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noConsoleInSource);
	});
});

const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				{
					code: "console.log('allowed in scripts');",
					filename: 'packages/shared-ts/scripts/example.ts',
				},
				{
					code: "console.log('allowed in tests');",
					filename: 'apps/front/src/routes/example/example.test.tsx',
				},
				{
					code: "console.log('allowed in jsx tests');",
					filename: 'apps/front\\src\\routes\\example\\example.test.jsx',
				},
				{
					code: "console.log('not under front source - ignored');",
					filename: 'apps/old-front/src/routes/example/example.ts',
				},
				{
					code:
						'const console = mockLogger;\n' +
						'export const Example = () => console.log("x");',
					filename: 'apps/front/src/routes/example/example.ts',
				},
				{
					code: "console.log('windows test file is ignored');",
					filename: 'apps/front\\src\\routes\\example\\example.test.tsx',
				},
			],
			invalid: [
				{
					code: "export const warn = () => console.warn('deprecated');",
					filename: 'packages/shared-ts/src/warn.ts',
					errors: [{ messageId: 'unexpected' }],
					output:
						`${LOGGER_IMPORT}\n` +
						"export const warn = () => logger.warn('deprecated');",
				},
				{
					code:
						`${LOGGER_IMPORT}\n\n` +
						'export const report = () => {\n' +
						"\tconsole.error('failed');\n" +
						'};',
					filename: 'packages/shared-ts/src/report.ts',
					errors: [{ messageId: 'unexpected' }],
					output:
						`${LOGGER_IMPORT}\n\n` +
						'export const report = () => {\n' +
						"\tlogger.error('failed');\n" +
						'};',
				},
				{
					code: "console.debug('front should still be checked');",
					filename: 'apps/front/src/routes/example/example.tsx',
					errors: [{ messageId: 'unexpected' }],
					output:
						`${LOGGER_IMPORT}\n` +
						"logger.debug('front should still be checked');",
				},
				{
					code: "console.log('front component');",
					filename: 'apps/front/src/components/auth/page.tsx',
					errors: [{ messageId: 'unexpected' }],
					output: `${LOGGER_IMPORT}\n` + "logger.log('front component');",
				},
				{
					code: "console.log('front parts');",
					filename: 'apps/front/src/_parts/auth/page.tsx',
					errors: [{ messageId: 'unexpected' }],
					output: `${LOGGER_IMPORT}\n` + "logger.log('front parts');",
				},
				{
					code: "console.log('front _components');",
					filename: 'apps/front\\src\\_components\\auth\\page.tsx',
					errors: [{ messageId: 'unexpected' }],
					output: `${LOGGER_IMPORT}\n` + "logger.log('front _components');",
				},
				{
					code:
						'export const Example = () => {\n' +
						"\tconsole.log('rendered');\n" +
						'\treturn null;\n' +
						'};',
					filename: 'apps/front/src/routes/example/example.tsx',
					errors: [{ messageId: 'unexpected' }],
					output:
						`${LOGGER_IMPORT}\n` +
						'export const Example = () => {\n' +
						"\tlogger.log('rendered');\n" +
						'\treturn null;\n' +
						'};',
				},
			],
		});
	});
};

runCases(noConsoleInSource, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');

describe('paired proof: old-front scope is gone (no-console-in-source)', () => {
	ruleTester.run(RULE_NAME, noConsoleInSource, {
		valid: [
			{
				code: "console.log('dead scope');",
				filename: 'apps/old-front/src/routes/example/example.ts',
			},
			{
				code: "console.log('dead scope tsx');",
				filename: 'apps/old-front/src/components/example.tsx',
			},
		],
		invalid: [],
	});
});
