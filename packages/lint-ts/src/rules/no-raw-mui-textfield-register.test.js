/**
 * Harness test for `publy/no-raw-mui-textfield-register` (issue #350,
 * PR JS.6, tracking #501).
 *
 * Uses Oxlint's own `RuleTester` (from `oxlint/plugins-dev`) bridged into
 * Node's built-in `node:test` runner, matching the existing lint-ts tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RuleTester } from 'oxlint/plugins-dev';

import plugin from '../index.js';
import { noRawMuiTextfieldRegister } from './no-raw-mui-textfield-register.js';

RuleTester.describe = describe;
RuleTester.it = it;

const RULE_NAME = 'no-raw-mui-textfield-register';

describe('plugin entrypoint wiring (@org/lint-ts)', () => {
	it(`wires rules["${RULE_NAME}"] to the rule object`, () => {
		assert.strictEqual(plugin.rules[RULE_NAME], noRawMuiTextfieldRegister);
	});
});

const frontTsx = (code) => ({
	code,
	filename: 'apps/old-front/src/components/example-form.tsx',
});
const frontJsx = (code) => ({
	code,
	filename: 'apps/old-front/src/components/example-form.jsx',
});
const front2Tsx = (code) => ({
	code,
	filename: 'apps/front/src/components/example-form.tsx',
});

const ruleTester = new RuleTester();

const runCases = (rule, label) => {
	describe(`publy/${RULE_NAME} (${label})`, () => {
		ruleTester.run(RULE_NAME, rule, {
			valid: [
				frontTsx('<Field.Text name="email" />;'),
				frontTsx('<TextField label="Plain" />;'),
				frontTsx('<TextField {...rest} />;'),
				frontJsx('<TextField label="Plain" />;'),
				front2Tsx('<TextField {...register("email")} />;'),
			],
			invalid: [
				{
					code: '<TextField {...register("email")} />;',
					filename: 'apps/old-front/src/components/example-form.tsx',
					errors: [{ messageId: 'raw' }],
				},
				{
					code: '<TextField {...register("email")} />;',
					filename: 'apps/old-front/src/components/example-form.jsx',
					errors: [{ messageId: 'raw' }],
				},
				{
					code: '<TextField inputProps={register("email")} />;',
					filename: 'apps/old-front/src/components/example-form.tsx',
					errors: [{ messageId: 'raw' }],
				},
			],
		});
	});
};

runCases(noRawMuiTextfieldRegister, 'via direct import');
runCases(plugin.rules[RULE_NAME], 'via plugin index export');
