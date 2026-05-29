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
	"import { logger } from '@/shared/lib/logger/iso-logger';";

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
					filename: 'apps/front/src/routes/example/example.test.ts',
				},
				{
					code: `${LOGGER_IMPORT}\n\nlogger.info('already using logger');`,
					filename: 'apps/front/src/routes/example/example.ts',
				},
				{
					code:
						'const console = mockLogger;\n' +
						'export const Example = () => console.log("x");',
					filename: 'apps/front/src/routes/example/example.ts',
				},
			],
			invalid: [
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
			],
		});
	});
};

runCases(noConsoleInSource, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
